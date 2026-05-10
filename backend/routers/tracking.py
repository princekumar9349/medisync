"""
routers/tracking.py — Medication dose tracking endpoints for Medisync.

Routes:
  POST /mark-done    — Log a dose as taken / missed / skipped  [PROTECTED]
  DELETE /expired    — Remove expired prescriptions for the user [PROTECTED]
"""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from db import database
from models.schemas import MarkDoneRequest, TokenData, SymptomCreate
from services.auth_service import get_current_user

logger = logging.getLogger("Medisync.Tracking")
router = APIRouter(tags=["Medication Tracking"])


# ─── Pillbox & Smart Skip Detection ─────────────────────────────────────────────

@router.get(
    "/pillbox",
    summary="Get organized pillbox slots with smart skip detection",
)
def get_pillbox(current_user: TokenData = Depends(get_current_user)):
    """
    Returns today's pillbox slots (morning, afternoon, night).
    If a scheduled time has passed and no dose was logged, it automatically
    marks the dose as missed and generates an alert message.
    """
    prescriptions_col = database.get_prescriptions()
    dose_logs_col = database.get_dose_logs()

    if prescriptions_col is None or dose_logs_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    # 1. Fetch user's active prescriptions
    rx_cursor = prescriptions_col.find(
        {"user_id": current_user.user_id}, 
        sort=[("created_at", -1)]
    )
    prescriptions = list(rx_cursor)

    slots = {"morning": [], "afternoon": [], "night": []}
    
    # Use UTC for checking elapsed time
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Deadlines for slots (UTC approximations for smart skip)
    # Morning deadline: 12:00 PM UTC
    # Afternoon deadline: 5:00 PM (17:00) UTC
    # Night deadline: Next day 4:00 AM UTC (we will just use 23:59 UTC for simplicity here)
    DEADLINES = {
        "morning": today_start.replace(hour=12),
        "afternoon": today_start.replace(hour=17),
        "night": today_start.replace(hour=23, minute=59, second=59)
    }

    missed_count = 0
    missed_slots = set()

    for rx in prescriptions:
        meds_to_process = rx.get("medicines", [])
        
        for med in meds_to_process:
            med_id = med.get("name", "").replace(" ", "_").lower() or "unknown"
            name = med.get("name", "Unknown Medicine")
            dosage = med.get("dosage", "")
            timing = (med.get("timing") or "").lower()
            
            # ── Determine all slots for this medicine ──────────────────
            # Priority: schedule list > bool fields > timing text > default
            schedule_list = med.get("schedule", [])
            
            target_slots = []
            
            # Level 1: Use schedule list (set by OCR parser)
            if schedule_list:
                for s in schedule_list:
                    if s in ("morning", "afternoon", "night"):
                        target_slots.append(s)
            
            # Level 2: Use individual bool fields (morning/afternoon/night)
            if not target_slots:
                if med.get("morning"):   target_slots.append("morning")
                if med.get("afternoon"): target_slots.append("afternoon")
                if med.get("night"):     target_slots.append("night")
            
            # Level 3: Use timing text string
            if not target_slots:
                if any(k in timing for k in ["morning", "breakfast", "सुबह"]):
                    target_slots.append("morning")
                if any(k in timing for k in ["afternoon", "lunch", "दोपहर"]):
                    target_slots.append("afternoon")
                if any(k in timing for k in ["night", "dinner", "evening", "रात"]):
                    target_slots.append("night")
            
            # Level 4: Default to morning
            if not target_slots:
                target_slots = ["morning"]
            
            # Add medicine entry to each of its slots
            for slot_key in target_slots:
                # Check logs for today
                log = dose_logs_col.find_one({
                    "user_id": current_user.user_id,
                    "med_id": med_id,
                    "timestamp": {"$gte": today_start}
                }, sort=[("timestamp", -1)])

                dose_status = log["status"] if log else "pending"

                # ── Smart Skip Detection ──
                if dose_status == "pending" and now > DEADLINES[slot_key]:
                    new_log = {
                        "user_id": current_user.user_id,
                        "med_id": med_id,
                        "medicine_name": name,
                        "status": "missed",
                        "timestamp": now,
                        "note": f"Auto-detected missed dose ({slot_key})",
                    }
                    dose_logs_col.insert_one(new_log)
                    dose_status = "missed"
                    logger.info(f"⚠️ Auto-missed {name} ({slot_key}) for user {current_user.user_id[:8]}")

                if dose_status in ("missed", "skipped"):
                    missed_count += 1
                    missed_slots.add(slot_key)

                slots[slot_key].append({
                    "med_id": med_id,
                    "name": name,
                    "dosage": dosage,
                    "timing": slot_key,
                    "status": dose_status,
                    "rx_id": str(rx["_id"])
                })

    alert_message = None
    if missed_count > 1:
        missed_names = " and ".join(list(missed_slots))
        next_slot = "afternoon" if "morning" in missed_slots and "afternoon" not in missed_slots else "evening"
        if "afternoon" in missed_slots: next_slot = "evening"
        if "night" in missed_slots: next_slot = "morning"
        
        alert_message = f"You missed your {missed_names} doses. Take your next dose at scheduled {next_slot} time."

    return {
        "slots": slots,
        "alert_message": alert_message
    }

# ─── Mark Dose Done ───────────────────────────────────────────────────────────

@router.post(
    "/mark-done",
    summary="Log a dose as taken, missed, or skipped",
)
def mark_done(
    payload: MarkDoneRequest,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Record a medication dose event for the authenticated user.

    Stores a log entry in the `dose_logs` collection with:
      - user_id, med_id, medicine_name (if resolvable), status, timestamp, note

    The adherence insight engine reads from this collection.
    """
    if payload.status not in ("taken", "missed", "skipped"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be one of: 'taken', 'missed', 'skipped'.",
        )

    dose_logs_col = database.get_dose_logs()
    prescriptions_col = database.get_prescriptions()

    # ── Resolve medicine name from DB (best-effort) ───────────────
    medicine_name = ""
    if prescriptions_col is not None:
        try:
            from bson import ObjectId
            # Find which prescription this med_id belongs to
            prescription = prescriptions_col.find_one({"user_id": current_user.user_id})
            if prescription:
                for med in prescription.get("medicines", []):
                    # Use med_id as index-based key or name match
                    if med.get("name", "").replace(" ", "_").lower() == payload.med_id.lower():
                        medicine_name = med.get("name", "")
                        break
        except Exception:
            pass   # non-critical — name resolution is best-effort

    # ── Calculate Delay Minutes ───────────────────────────────────
    now = datetime.utcnow()
    delay_minutes = 0
    if payload.status == "taken":
        # Approximate expected time based on current hour
        # Morning ~ 09:00, Afternoon ~ 13:00, Night ~ 21:00
        hour = now.hour
        if 5 <= hour < 12:
            expected = now.replace(hour=9, minute=0, second=0, microsecond=0)
        elif 12 <= hour < 17:
            expected = now.replace(hour=13, minute=0, second=0, microsecond=0)
        else:
            expected = now.replace(hour=21, minute=0, second=0, microsecond=0)
        
        diff = (now - expected).total_seconds() / 60.0
        if diff > 0:
            delay_minutes = int(diff)

    # ── Build log document ────────────────────────────────────────
    log_doc = {
        "user_id": current_user.user_id,
        "med_id": payload.med_id,
        "medicine_name": medicine_name or payload.med_id,
        "status": payload.status,
        "timestamp": now,
        "delay_minutes": delay_minutes,
        "note": payload.note,
    }

    # ── Persist log ───────────────────────────────────────────────
    if dose_logs_col is None:
        logger.warning("MongoDB unavailable — dose log not persisted.")
        return {
            "message": f"Dose marked as '{payload.status}' (not persisted — database offline).",
            "med_id": payload.med_id,
            "status": payload.status,
        }

    try:
        dose_logs_col.insert_one(log_doc)
        logger.info(
            f"✅ Dose logged: {payload.med_id} → {payload.status} "
            f"for user {current_user.user_id[:8]}..."
        )
    except Exception as db_err:
        logger.error(f"Could not save dose log: {db_err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save dose log.",
        )

    return {
        "message": f"Dose marked as '{payload.status}' successfully.",
        "med_id": payload.med_id,
        "status": payload.status,
        "logged_at": log_doc["timestamp"],
    }


# ─── Delete Expired Prescriptions ────────────────────────────────────────────

@router.delete(
    "/expired",
    summary="Remove expired prescriptions for the current user",
)
def delete_expired(
    current_user: TokenData = Depends(get_current_user),
):
    """
    Delete prescriptions where ALL medicines have passed their expiry date.

    Only affects prescriptions belonging to the authenticated user.
    Anonymous prescriptions (user_id=None) are not touched.
    """
    prescriptions_col = database.get_prescriptions()

    if prescriptions_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    now = datetime.utcnow()

    # Fetch only this user's prescriptions
    user_prescriptions = list(
        prescriptions_col.find({"user_id": current_user.user_id})
    )

    deleted_count = 0

    for doc in user_prescriptions:
        medicines = doc.get("medicines", [])

        if not medicines:
            # Empty prescription — clean up
            prescriptions_col.delete_one({"_id": doc["_id"]})
            deleted_count += 1
            continue

        # A prescription is expired only if ALL its medicines are expired
        all_expired = all(
            med.get("expiry_date") is not None and med["expiry_date"] < now
            for med in medicines
        )

        if all_expired:
            prescriptions_col.delete_one({"_id": doc["_id"]})
            deleted_count += 1

    logger.info(
        f"🗑️  Deleted {deleted_count} expired prescription(s) "
        f"for user {current_user.user_id[:8]}..."
    )

    return {
        "message": f"Deleted {deleted_count} expired prescription(s).",
        "deleted_count": deleted_count,
    }

# ─── Symptoms ───────────────────────────────────────────────────────────────────

@router.post(
    "/symptoms",
    summary="Report a symptom",
)
def add_symptom(payload: SymptomCreate, current_user: TokenData = Depends(get_current_user)):
    """
    Log a new symptom into the database.
    """
    symptoms_col = database.get_symptoms()
    
    if symptoms_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    doc = {
        "user_id": payload.user_id or current_user.user_id,
        "symptom": payload.symptom,
        "severity": payload.severity,
        "time_context": payload.time_context,
        "timestamp": datetime.fromisoformat(payload.timestamp.replace('Z', '+00:00')) if payload.timestamp else datetime.utcnow()
    }
    
    symptoms_col.insert_one(doc)
    
    return {"message": "Symptom logged successfully."}


# ─── Advanced Adherence Analytics ──────────────────────────────────────────

from models.schemas import AdherenceAnalyticsResponse, DailyLogPoint
from datetime import timedelta
from collections import defaultdict

@router.get(
    "/medicine/analytics",
    response_model=AdherenceAnalyticsResponse,
    summary="Get advanced charting data for adherence",
)
def get_medicine_analytics(
    days: int = 30,
    current_user: TokenData = Depends(get_current_user)
):
    """
    Returns chart-ready JSON containing:
      - overall adherence score
      - weekly trends (for line graphs)
      - frequently missed medicines
      - timing consistency (morning vs night)
      - daily logs (for heatmaps)
    """
    dose_logs_col = database.get_dose_logs()
    if dose_logs_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    now = datetime.utcnow()
    start_date = now - timedelta(days=days)

    cursor = dose_logs_col.find({
        "user_id": current_user.user_id,
        "timestamp": {"$gte": start_date}
    })
    logs = list(cursor)

    total_taken = 0
    total_missed_or_skipped = 0
    
    missed_counts = defaultdict(int)
    timing_stats = {"morning": {"total": 0, "taken": 0}, "afternoon": {"total": 0, "taken": 0}, "night": {"total": 0, "taken": 0}}
    daily_trends = defaultdict(lambda: {"total": 0, "taken": 0})
    daily_points = []
    
    delay_collection = {"morning": [], "afternoon": [], "night": []}
    time_collection = {"morning": [], "afternoon": [], "night": []}

    for log in logs:
        st = log.get("status", "pending")
        ts = log["timestamp"]
        day_str = ts.strftime("%Y-%m-%d")
        med_name = log.get("medicine_name", "Unknown")
        delay_min = log.get("delay_minutes", 0)
        
        # Timing bin
        hour = ts.hour
        if 5 <= hour < 12: slot = "morning"
        elif 12 <= hour < 17: slot = "afternoon"
        else: slot = "night"

        daily_trends[day_str]["total"] += 1
        timing_stats[slot]["total"] += 1

        daily_points.append(DailyLogPoint(
            date=day_str,
            status=st,
            delay_minutes=delay_min,
            medicine=med_name
        ))

        if st == "taken":
            total_taken += 1
            daily_trends[day_str]["taken"] += 1
            timing_stats[slot]["taken"] += 1
            
            # Collect delays and times
            delay_collection[slot].append(delay_min)
            # Store time as minutes from midnight for easy min/max sorting
            time_collection[slot].append(ts.hour * 60 + ts.minute)
            
        elif st in ("missed", "skipped"):
            total_missed_or_skipped += 1
            missed_counts[med_name] += 1

    # Calculations
    total_logs = total_taken + total_missed_or_skipped
    score = int((total_taken / total_logs * 100)) if total_logs > 0 else 100

    weekly_trend = []
    for day, stats in sorted(daily_trends.items()):
        pct = int((stats["taken"] / stats["total"] * 100)) if stats["total"] > 0 else 0
        weekly_trend.append({"day": day, "score": pct})

    # Top missed
    top_missed = [med for med, count in sorted(missed_counts.items(), key=lambda x: x[1], reverse=True)[:5]]

    # Consistency & Stats
    timing_consistency = {}
    delay_stats = {}
    time_windows = {}
    
    for slot in ["morning", "afternoon", "night"]:
        stats = timing_stats[slot]
        if stats["total"] > 0:
            timing_consistency[slot] = int((stats["taken"] / stats["total"]) * 100)
            
        # Delay Stats
        delays = delay_collection[slot]
        delay_stats[slot] = int(sum(delays) / len(delays)) if delays else 0
        
        # Time Windows
        times = time_collection[slot]
        if times:
            min_time = min(times)
            max_time = max(times)
            start_str = f"{min_time // 60:02d}:{min_time % 60:02d}"
            end_str = f"{max_time // 60:02d}:{max_time % 60:02d}"
            time_windows[slot] = {"start": start_str, "end": end_str}
        else:
            time_windows[slot] = {"start": "--:--", "end": "--:--"}

    return AdherenceAnalyticsResponse(
        adherence_score=score,
        weekly_trend=weekly_trend[-7:], # Only last 7 days for trend
        missed_medicines=top_missed,
        timing_consistency=timing_consistency,
        delay_stats=delay_stats,
        time_windows=time_windows,
        daily_logs=daily_points
    )


from models.schemas import SmartReportResponse
from services.llm_service import generate_smart_adherence_report

@router.get(
    "/medicine/smart-report",
    response_model=SmartReportResponse,
    summary="Get AI-generated insight report on medicine adherence",
)
def get_smart_report(
    days: int = 30,
    current_user: TokenData = Depends(get_current_user)
):
    """
    Analyzes raw adherence stats and patient memory via Gemini
    to generate an actionable health insight report.
    """
    # 1. Fetch Analytics data
    analytics_response = get_medicine_analytics(days, current_user)
    
    # 2. Fetch patient memory (latest context)
    patient_memory = {}
    prescriptions_col = database.get_prescriptions()
    if prescriptions_col is not None:
        latest_rx = prescriptions_col.find_one(
            {"user_id": current_user.user_id},
            sort=[("created_at", -1)]
        )
        if latest_rx and "patient_memory" in latest_rx:
            patient_memory = latest_rx["patient_memory"]

    # 3. Generate report
    report_data = generate_smart_adherence_report(
        analytics_data=analytics_response.model_dump(),
        patient_memory=patient_memory
    )
    
    return SmartReportResponse(
        report_text=report_data.get("report_text", "Could not generate report."),
        critical_alerts=report_data.get("critical_alerts", []),
        confidence_score=report_data.get("confidence_score", 0.0)
    )
