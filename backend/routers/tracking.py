"""
routers/tracking.py — Medication dose tracking with IST-aware state machine.

Dose States: upcoming | active | late | missed | skipped | taken
Slot Windows (IST):
  morning:   active 07:00-09:00, late 09:00-11:00, missed after 11:00
  afternoon: active 12:00-14:00, late 14:00-16:00, missed after 16:00
  night:     active 20:00-22:00, late 22:00-23:30, missed after 23:30
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from db import database
from models.schemas import MarkDoneRequest, TokenData, SymptomCreate
from services.auth_service import get_current_user, require_patient

logger = logging.getLogger("Medisync.Tracking")
router = APIRouter(tags=["Medication Tracking"])

# IST timezone 
IST = timezone(timedelta(hours=5, minutes=30))

#  Slot Window Definitions (IST hours, minutes) 
# Each slot: (active_open, late_open, missed_after) — all in IST local time
SLOT_WINDOWS = {
    "morning":   {"open": (7, 0),  "late": (9, 0),  "close": (11, 0),  "label": "07:00", "late_label": "09:00", "close_label": "11:00"},
    "afternoon": {"open": (12, 0), "late": (14, 0), "close": (16, 0),  "label": "12:00", "late_label": "14:00", "close_label": "16:00"},
    "night":     {"open": (20, 0), "late": (22, 0), "close": (23, 30), "label": "20:00", "late_label": "22:00", "close_label": "23:30"},
}


def _ist_now() -> datetime:
    """Return current datetime in IST."""
    return datetime.now(IST)


def _ist_today_ts(hour: int, minute: int) -> datetime:
    """Return today's IST datetime at the given hour:minute."""
    now_ist = _ist_now()
    return now_ist.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _compute_dose_state(slot_key: str, log_status: Optional[str]) -> dict:
    """
    Returns dose state dict for a given slot based on current IST time and
    any existing log entry for today.
    """
    now_ist = _ist_now()
    w = SLOT_WINDOWS[slot_key]

    t_open  = _ist_today_ts(*w["open"])
    t_late  = _ist_today_ts(*w["late"])
    t_close = _ist_today_ts(*w["close"])

    # Handle night close at 23:30 — must not be mistaken for tomorrow
    if slot_key == "night" and w["close"] == (23, 30):
        t_close = _ist_today_ts(23, 30)

    # Already logged today 
    if log_status in ("taken", "skipped"):
        return {
            "status": log_status,
            "can_take": False,
            "can_skip": False,
        }

    # Pending  determine by current time 
    if now_ist < t_open:
        return {"status": "upcoming", "can_take": False, "can_skip": False}
    elif t_open <= now_ist < t_late:
        return {"status": "active",   "can_take": True,  "can_skip": True}
    elif t_late <= now_ist < t_close:
        return {"status": "late",     "can_take": True,  "can_skip": True}
    else:
        # Window closed — auto-mark as missed (caller will persist)
        return {"status": "missed",   "can_take": False, "can_skip": False, "auto_missed": True}


def _get_today_log(dose_logs_col, user_id: str, med_id: str) -> Optional[dict]:
    """Fetch most recent dose log for this med_id today (IST midnight → now)."""
    now_ist = _ist_now()
    today_ist_midnight = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    # Convert IST midnight to UTC for MongoDB query
    today_utc = today_ist_midnight.astimezone(timezone.utc)

    return dose_logs_col.find_one(
        {"user_id": user_id, "med_id": med_id, "timestamp": {"$gte": today_utc}},
        sort=[("timestamp", -1)],
    )


def _resolve_target_slots(med: dict) -> list:
    """Determine which slots a medicine belongs to, using priority order."""
    schedule_list = med.get("schedule", [])
    target_slots = [s for s in schedule_list if s in ("morning", "afternoon", "night")]

    if not target_slots:
        if med.get("morning"):   target_slots.append("morning")
        if med.get("afternoon"): target_slots.append("afternoon")
        if med.get("night"):     target_slots.append("night")

    if not target_slots:
        timing = (med.get("timing") or "").lower()
        if any(k in timing for k in ["morning", "breakfast", "सुबह"]):
            target_slots.append("morning")
        if any(k in timing for k in ["afternoon", "lunch", "दोपहर"]):
            target_slots.append("afternoon")
        if any(k in timing for k in ["night", "dinner", "evening", "रात"]):
            target_slots.append("night")

    return target_slots or ["morning"]


# GET /pillbox 

@router.get("/pillbox", summary="Get pillbox slots with IST-aware dose states")
def get_pillbox(current_user: TokenData = Depends(get_current_user)):
    """
    Returns today's pillbox with full 6-state dose machine per medicine.
    Auto-persists missed doses when window expires (backend is source of truth).
    """
    prescriptions_col = database.get_prescriptions()
    dose_logs_col     = database.get_dose_logs()

    if prescriptions_col is None or dose_logs_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    rx_cursor = prescriptions_col.find(
        {"user_id": current_user.user_id},
        sort=[("created_at", -1)],
    )
    prescriptions = list(rx_cursor)

    slots: dict = {"morning": [], "afternoon": [], "night": []}
    summary = {"total": 0, "taken": 0, "missed": 0, "late": 0, "upcoming": 0, "active": 0, "skipped": 0}

    # Dedup: track (med_id, slot) pairs already added to prevent ghost duplicates
    seen = set()

    for rx in prescriptions:
        rx_id = str(rx["_id"])
        for med in rx.get("medicines", []):
            name    = med.get("name", "Unknown Medicine")
            med_id  = (name or "unknown").replace(" ", "_").lower()
            dosage  = med.get("dosage", "")
            is_crit = med.get("is_critical", False)

            for slot_key in _resolve_target_slots(med):
                dedup_key = f"{med_id}::{slot_key}"
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)

                log = _get_today_log(dose_logs_col, current_user.user_id, med_id)
                log_status = log["status"] if log else None
                state = _compute_dose_state(slot_key, log_status)

                # Auto-persist missed dose — backend is source of truth
                if state.get("auto_missed") and log_status not in ("taken", "skipped", "missed"):
                    missed_doc = {
                        "user_id":      current_user.user_id,
                        "med_id":       med_id,
                        "medicine_name": name,
                        "status":       "missed",
                        "slot":         slot_key,
                        "timestamp":    datetime.utcnow(),
                        "note":         f"Auto-missed: window expired ({slot_key})",
                        "is_critical":  is_crit,
                    }
                    dose_logs_col.insert_one(missed_doc)
                    logger.info(f"  Auto-missed {name} ({slot_key}) for {current_user.user_id[:8]}")

                w = SLOT_WINDOWS[slot_key]
                entry = {
                    "med_id":          med_id,
                    "name":            name,
                    "dosage":          dosage,
                    "timing":          slot_key,
                    "status":          state["status"],
                    "rx_id":           rx_id,
                    "is_critical":     is_crit,
                    "window_open_ist":  w["label"],
                    "window_close_ist": w["close_label"],
                    "late_window_ist":  w["late_label"],
                    "can_take":        state["can_take"],
                    "can_skip":        state["can_skip"],
                }
                slots[slot_key].append(entry)

                s = state["status"]
                summary["total"] += 1
                summary[s] = summary.get(s, 0) + 1

    # Build alert message for missed medicines
    missed_names = [
        e["name"] for slot_meds in slots.values() for e in slot_meds if e["status"] == "missed"
    ]
    alert_message = None
    if missed_names:
        unique = list(dict.fromkeys(missed_names))[:3]
        alert_message = f"Missed: {', '.join(unique)}. Please take your next scheduled dose on time."

    now_ist = _ist_now()
    return {
        "slots": slots,
        "alert_message": alert_message,
        "summary": summary,
        "last_updated_ist": now_ist.strftime("%I:%M %p IST"),
    }


# POST /mark-done 

@router.post("/mark-done", summary="Log a dose as taken, missed, or skipped")
def mark_done(
    payload: MarkDoneRequest,
    current_user: TokenData = Depends(require_patient),
):
    """
    Record a medication dose event. Validates that the action is allowed
    given the current dose window state (prevents marking stale missed doses as taken).
    Pass slot='morning'|'afternoon'|'night' in the note field as JSON metadata.
    """
    if payload.status not in ("taken", "missed", "skipped"):
        raise HTTPException(status_code=400, detail="Status must be: taken, missed, or skipped.")

    dose_logs_col     = database.get_dose_logs()
    prescriptions_col = database.get_prescriptions()

    if dose_logs_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    #  Prevent duplicate logs (idempotency) 
    existing = _get_today_log(dose_logs_col, current_user.user_id, payload.med_id)
    if existing and existing["status"] in ("taken", "skipped"):
        return {
            "message": f"Dose already recorded as '{existing['status']}' today.",
            "med_id":  payload.med_id,
            "status":  existing["status"],
            "duplicate": True,
        }

    # Infer slot from existing schedule if not provided 
    slot_key = None
    medicine_name = payload.med_id
    is_critical = False

    if prescriptions_col is not None:
        rx = prescriptions_col.find_one({"user_id": current_user.user_id}, sort=[("created_at", -1)])
        if rx:
            for med in rx.get("medicines", []):
                mid = (med.get("name") or "").replace(" ", "_").lower()
                if mid == payload.med_id.lower():
                    medicine_name = med.get("name", payload.med_id)
                    is_critical   = med.get("is_critical", False)
                    slots = _resolve_target_slots(med)
                    if slots:
                        slot_key = slots[0]
                    break

    # Time-window validation for "taken" action 
    if payload.status == "taken" and slot_key:
        state = _compute_dose_state(slot_key, None)
        if not state["can_take"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot mark as taken — the {slot_key} window has expired. Dose is now '{state['status']}'.",
            )

    #  Calculate delay minutes 
    delay_minutes = 0
    if payload.status == "taken" and slot_key:
        w = SLOT_WINDOWS[slot_key]
        expected_ist = _ist_today_ts(*w["open"])
        now_ist = _ist_now()
        diff = (now_ist - expected_ist).total_seconds() / 60.0
        delay_minutes = max(0, int(diff))

    log_doc = {
        "user_id":       current_user.user_id,
        "med_id":        payload.med_id,
        "medicine_name": medicine_name,
        "status":        payload.status,
        "slot":          slot_key or "unknown",
        "timestamp":     datetime.utcnow(),
        "delay_minutes": delay_minutes,
        "is_critical":   is_critical,
        "note":          payload.note,
    }

    try:
        dose_logs_col.insert_one(log_doc)
        logger.info(f"Dose: {payload.med_id} → {payload.status} for {current_user.user_id[:8]}")
    except Exception as e:
        logger.error(f"Dose log save failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to save dose log.")

    return {
        "message": f"Dose marked as '{payload.status}'.",
        "med_id":  payload.med_id,
        "status":  payload.status,
        "logged_at": log_doc["timestamp"].isoformat(),
    }


# DELETE /expired 

@router.delete("/expired", summary="Remove expired prescriptions for the current user")
def delete_expired(current_user: TokenData = Depends(get_current_user)):
    prescriptions_col = database.get_prescriptions()
    if prescriptions_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    now = datetime.utcnow()
    user_prescriptions = list(prescriptions_col.find({"user_id": current_user.user_id}))
    deleted_count = 0

    for doc in user_prescriptions:
        medicines = doc.get("medicines", [])
        if not medicines:
            prescriptions_col.delete_one({"_id": doc["_id"]})
            deleted_count += 1
            continue
        all_expired = all(
            med.get("expiry_date") and med["expiry_date"] < now for med in medicines
        )
        if all_expired:
            prescriptions_col.delete_one({"_id": doc["_id"]})
            deleted_count += 1

    return {"message": f"Deleted {deleted_count} expired prescription(s).", "deleted_count": deleted_count}


# DELETE /prescription/{rx_id}/medicine/{med_index} 

@router.delete(
    "/prescription/{rx_id}/medicine/{med_index}",
    summary="Patient removes a specific medicine from their prescription",
)
def patient_delete_medicine(
    rx_id: str,
    med_index: int,
    current_user: TokenData = Depends(require_patient),
):
    """
    Remove a single medicine by index from a prescription.
    Validates ownership. Cleans up today's dose logs for that med.
    """
    prescriptions_col = database.get_prescriptions()
    dose_logs_col     = database.get_dose_logs()

    if prescriptions_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    try:
        rx = prescriptions_col.find_one({"_id": ObjectId(rx_id), "user_id": current_user.user_id})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid prescription ID.")

    if not rx:
        raise HTTPException(status_code=404, detail="Prescription not found or access denied.")

    medicines = rx.get("medicines", [])
    if med_index < 0 or med_index >= len(medicines):
        raise HTTPException(status_code=400, detail=f"Medicine index {med_index} out of range.")

    removed_med = medicines[med_index]
    med_id = (removed_med.get("name") or "unknown").replace(" ", "_").lower()

    # Remove the medicine from the array
    updated_medicines = [m for i, m in enumerate(medicines) if i != med_index]
    prescriptions_col.update_one(
        {"_id": rx["_id"]},
        {"$set": {"medicines": updated_medicines}},
    )

    # Clean up today's dose logs for this med
    if dose_logs_col is not None:
        now_ist = _ist_now()
        today_utc = now_ist.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
        dose_logs_col.delete_many({
            "user_id": current_user.user_id,
            "med_id":  med_id,
            "timestamp": {"$gte": today_utc},
        })

    logger.info(f"🗑️  Removed medicine '{removed_med.get('name')}' from rx {rx_id[:8]} for {current_user.user_id[:8]}")
    return {
        "message":      f"Removed '{removed_med.get('name', 'medicine')}' successfully.",
        "rx_id":        rx_id,
        "removed_name": removed_med.get("name"),
        "medicines_remaining": len(updated_medicines),
    }


#  POST /symptoms 

@router.post("/symptoms", summary="Report a symptom")
def add_symptom(payload: SymptomCreate, current_user: TokenData = Depends(require_patient)):
    symptoms_col = database.get_symptoms()
    if symptoms_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    doc = {
        "user_id":      payload.user_id or current_user.user_id,
        "symptom":      payload.symptom,
        "severity":     payload.severity,
        "time_context": payload.time_context,
        "timestamp":    datetime.fromisoformat(payload.timestamp.replace("Z", "+00:00")) if payload.timestamp else datetime.utcnow(),
    }
    symptoms_col.insert_one(doc)
    return {"message": "Symptom logged successfully."}


# ─── GET /medicine/analytics 

from models.schemas import AdherenceAnalyticsResponse, DailyLogPoint
from collections import defaultdict

@router.get("/medicine/analytics", response_model=AdherenceAnalyticsResponse, summary="Advanced adherence analytics")
def get_medicine_analytics(days: int = 30, current_user: TokenData = Depends(get_current_user)):
    dose_logs_col = database.get_dose_logs()
    if dose_logs_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    now = datetime.utcnow()
    start_date = now - timedelta(days=days)
    logs = list(dose_logs_col.find({"user_id": current_user.user_id, "timestamp": {"$gte": start_date}}))

    total_taken = total_missed = 0
    missed_counts: dict = defaultdict(int)
    timing_stats = {s: {"total": 0, "taken": 0} for s in ("morning", "afternoon", "night")}
    daily_trends: dict = defaultdict(lambda: {"total": 0, "taken": 0})
    daily_points = []
    delay_collection: dict = defaultdict(list)
    time_collection:  dict = defaultdict(list)

    for log in logs:
        st = log.get("status", "pending")
        ts = log["timestamp"]
        day_str  = ts.strftime("%Y-%m-%d")
        med_name = log.get("medicine_name", "Unknown")
        delay    = log.get("delay_minutes", 0)

        hour = ts.hour
        if   5 <= hour < 12: slot = "morning"
        elif 12 <= hour < 17: slot = "afternoon"
        else:                  slot = "night"

        daily_trends[day_str]["total"] += 1
        timing_stats[slot]["total"] += 1
        daily_points.append(DailyLogPoint(date=day_str, status=st, delay_minutes=delay, medicine=med_name))

        if st == "taken":
            total_taken += 1
            daily_trends[day_str]["taken"] += 1
            timing_stats[slot]["taken"] += 1
            delay_collection[slot].append(delay)
            time_collection[slot].append(ts.hour * 60 + ts.minute)
        elif st in ("missed", "skipped"):
            total_missed += 1
            missed_counts[med_name] += 1

    total_logs = total_taken + total_missed
    score = int(total_taken / total_logs * 100) if total_logs > 0 else 100

    weekly_trend = [
        {"day": d, "score": int(s["taken"] / s["total"] * 100) if s["total"] > 0 else 0}
        for d, s in sorted(daily_trends.items())
    ]

    timing_consistency, delay_stats, time_windows = {}, {}, {}
    for slot in ("morning", "afternoon", "night"):
        st = timing_stats[slot]
        if st["total"] > 0:
            timing_consistency[slot] = int(st["taken"] / st["total"] * 100)
        delays = delay_collection[slot]
        delay_stats[slot] = int(sum(delays) / len(delays)) if delays else 0
        times = time_collection[slot]
        if times:
            mn, mx = min(times), max(times)
            time_windows[slot] = {"start": f"{mn//60:02d}:{mn%60:02d}", "end": f"{mx//60:02d}:{mx%60:02d}"}
        else:
            time_windows[slot] = {"start": "--:--", "end": "--:--"}

    top_missed = [m for m, _ in sorted(missed_counts.items(), key=lambda x: x[1], reverse=True)[:5]]

    return AdherenceAnalyticsResponse(
        adherence_score=score,
        weekly_trend=weekly_trend[-7:],
        missed_medicines=top_missed,
        timing_consistency=timing_consistency,
        delay_stats=delay_stats,
        time_windows=time_windows,
        daily_logs=daily_points,
    )


# ─── GET /medicine/smart-report 

from models.schemas import SmartReportResponse
from services.llm_service import generate_smart_adherence_report

@router.get("/medicine/smart-report", response_model=SmartReportResponse, summary="AI adherence report")
def get_smart_report(days: int = 30, current_user: TokenData = Depends(get_current_user)):
    analytics_response = get_medicine_analytics(days, current_user)

    patient_memory = {}
    prescriptions_col = database.get_prescriptions()
    if prescriptions_col is not None:
        latest_rx = prescriptions_col.find_one({"user_id": current_user.user_id}, sort=[("created_at", -1)])
        if latest_rx and "patient_memory" in latest_rx:
            patient_memory = latest_rx["patient_memory"]

    report_data = generate_smart_adherence_report(
        analytics_data=analytics_response.model_dump(),
        patient_memory=patient_memory,
    )
    return SmartReportResponse(
        report_text=report_data.get("report_text", "Could not generate report."),
        critical_alerts=report_data.get("critical_alerts", []),
        confidence_score=report_data.get("confidence_score", 0.0),
    )
