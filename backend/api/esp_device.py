"""
api/esp_device.py — ESP8266/ESP32 Hardware Device Integration
No JWT needed — Simple API Key via query param (easiest for ESP hardware)
"""
import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query

from db import database
from adherence.state_machine import compute_slot_state, AdherenceState, _ist_now, _today_utc_midnight
from adherence.slot_resolver import resolve_target_slots, get_current_or_next_slot
from adherence.dedupe import check_idempotency
from core.events.bus import EventBus
from core.events.types import DomainEvent

logger = logging.getLogger("Medisync.ESP")
router = APIRouter(prefix="/device", tags=["IoT Device"])

IST = timezone(timedelta(hours=5, minutes=30))

# ─── Auth ─────────────────────────────────────────────────────────────────────
# KEY passed as query param: ?key=medisync-esp-2024
# (headers are tricky on some ESP clients — query param is simpler)
DEVICE_KEY = os.getenv("ESP_DEVICE_KEY", "medisync-esp-2024")

def _check_key(key: str):
    if key != DEVICE_KEY:
        raise HTTPException(
            status_code=401,
            detail="Invalid key. Add ?key=medisync-esp-2024 to URL"
        )

# ─── Removed duplicated slot definitions ───
# We now use the unified adherence engine.

def _resolve_slots(med: dict) -> list:
    return resolve_target_slots(med)

def _find_user(users_col, patient_id: str):
    pid = patient_id.strip()
    for search_id in [pid, pid.upper(), pid.lower()]:
        user = users_col.find_one({"patient_id": search_id})
        if user:
            return user
    return None


# ─── GET /device/ping ────────────────────────────────────────────────────────
@router.get("/ping", summary="ESP8266: Health check (no auth)")
def device_ping():
    """No auth required. Use to verify server is reachable."""
    return {
        "status":   "ok",
        "server":   "MediSync",
        "time_ist": _ist_now().strftime("%H:%M:%S IST"),
    }


# ─── GET /device/schedule ─────────────────────────────────────────────────────
@router.get("/schedule", summary="ESP8266: Get today's medicine schedule")
def get_device_schedule(
    patient_id: str = Query(..., description="Patient ID e.g. P-614961"),
    key:        str = Query("", description="Device API key"),
):
    """
    Get today's medicine schedule for a patient.

    URL: /device/schedule?patient_id=P-614961&key=medisync-esp-2024

    Returns all medicines with their status (upcoming/active/missed/taken).
    """
    _check_key(key)

    # ── DB connections ────────────────────────────────────────────────────────
    users_col         = database.get_users()
    prescriptions_col = database.get_prescriptions()
    dose_logs_col     = database.get_dose_logs()

    if users_col is None:
        raise HTTPException(status_code=503, detail="users DB unavailable")
    if prescriptions_col is None:
        raise HTTPException(status_code=503, detail="prescriptions DB unavailable")
    if dose_logs_col is None:
        raise HTTPException(status_code=503, detail="dose_logs DB unavailable")

    # ── Find patient ──────────────────────────────────────────────────────────
    user = _find_user(users_col, patient_id)
    if not user:
        raise HTTPException(
            status_code=404,
            detail=f"Patient '{patient_id}' not found. Verify the patient_id is correct."
        )

    # user_id: stored as string in prescriptions/dose_logs
    user_id      = user.get("user_id") or str(user["_id"])
    patient_name = user.get("name", "Patient")

    # ── Latest prescription ───────────────────────────────────────────────────
    rx = prescriptions_col.find_one({"user_id": user_id}, sort=[("created_at", -1)])
    medicines_raw = rx.get("medicines", []) if rx else []

    # ── Time context ──────────────────────────────────────────────────────────
    now_ist   = _ist_now()
    today_utc = _today_utc_midnight()

    # ── Build output ──────────────────────────────────────────────────────────
    medicines_out = []
    active_now    = []
    missed_today  = []
    taken_count   = 0

    for med in medicines_raw:
        name    = med.get("name") or "Unknown"
        dosage  = med.get("dosage") or ""
        med_id  = name.replace(" ", "_").lower()
        is_crit = bool(med.get("is_critical", False))

        for slot in _resolve_slots(med):
            # Check today's log
            log = dose_logs_col.find_one(
                {"user_id": user_id, "med_id": med_id, "timestamp": {"$gte": today_utc}},
                sort=[("timestamp", -1)],
            )

            if log and log.get("status") in ("taken", "skipped"):
                status   = log["status"]
                can_take = False
                if status == "taken":
                    taken_count += 1
            else:
                st, can_take = compute_slot_state(slot, now_ist)
                status = st.value
                if status == "missed":
                    missed_today.append(name)

            from adherence.state_machine import SLOT_WINDOWS
            
            entry = {
                "name":        name,
                "dosage":      dosage,
                "slot":        slot,
                "time":        SLOT_WINDOWS[slot]["display"] if slot in SLOT_WINDOWS else "00:00",
                "status":      status,
                "can_take":    can_take,
                "is_critical": is_crit,
            }
            medicines_out.append(entry)

            if status == "active":
                active_now.append({"name": name, "slot": slot, "time": SLOT_WINDOWS[slot]["display"] if slot in SLOT_WINDOWS else "00:00"})

    # ── Next medicine ─────────────────────────────────────────────────────────
    next_med = None
    for slot in ("morning", "afternoon", "night"):
        for m in medicines_out:
            if m["slot"] == slot and m["status"] in ("upcoming", "active"):
                next_med = {"name": m["name"], "slot": slot, "at": m["time"]}
                break
        if next_med:
            break

    logger.info(f"[ESP] ✅ Schedule OK for {patient_id} — {len(medicines_out)} medicines")

    return {
        "ok":                     True,
        "patient_name":           patient_name,
        "patient_id":             patient_id,
        "current_time_ist":       now_ist.strftime("%I:%M %p IST"),
        "medicines":              medicines_out,
        "active_now":             active_now,
        "missed_today":           list(set(missed_today)),
        "next_medicine":          next_med,
        "total_today":            len(medicines_out),
        "taken_today":            taken_count,
        "fetch_again_in_seconds": 60,
    }


# ─── POST /device/confirm-taken ───────────────────────────────────────────────
@router.post("/confirm-taken", summary="ESP8266: Mark medicine as taken")
async def device_confirm_taken(
    patient_id:    str = Query(...),
    medicine_name: str = Query(...),
    slot:          str = Query("morning"),
    key:           str = Query(""),
):
    """
    URL: /device/confirm-taken?patient_id=P-614961&medicine_name=Paracetamol&slot=morning&key=medisync-esp-2024
    """
    _check_key(key)

    users_col     = database.get_users()
    dose_logs_col = database.get_dose_logs()

    if users_col is None or dose_logs_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user = _find_user(users_col, patient_id)
    if not user:
        raise HTTPException(status_code=404, detail="Patient not found")

    user_id   = user.get("user_id") or str(user["_id"])
    med_id    = medicine_name.strip().replace(" ", "_").lower()
    now_utc   = datetime.now(tz=timezone.utc)
    now_ist   = _ist_now()

    # Dedupe and Idempotency Protection
    dedupe_res = check_idempotency(dose_logs_col, user_id, med_id, slot)
    if dedupe_res.get("is_duplicate"):
        # Respond gracefully so IoT assumes success without error loops
        return {
            "ok": True, 
            "status": "already_taken", 
            "message": "Dose already confirmed"
        }

    # Time Window Validation
    status, can_take = compute_slot_state(slot, now_ist)
    if not can_take:
        if status == AdherenceState.UPCOMING:
            return {"ok": False, "status": "upcoming", "message": "Abhi time nahi hua hai"}
        else:
            # Emit critical escalation if missed
            # In a real system, we might only do this for critical meds, but doing it generally here for architecture
            import asyncio
            from core.events.bus import bus
            asyncio.create_task(bus.publish(DomainEvent.CRITICAL_MEDICATION_MISSED, {"user_id": user_id, "med_id": med_id, "slot": slot}))
            return {"ok": False, "status": "missed", "message": f"{slot.capitalize()} slot missed"}

    # Determine Device ID from key (for demo logging)
    device_id = "ESP32_Pillbox" if key == DEVICE_KEY else "Unknown_Device"
    dedupe_key = f"{user_id}_{med_id}_{slot}_{now_ist.date().isoformat()}"

    # Insert authoritative server record
    dose_logs_col.insert_one({
        "user_id":          user_id,
        "med_id":           med_id,
        "medicine_name":    medicine_name.strip(),
        "status":           "taken",
        "slot":             slot,
        "timestamp":        now_utc,
        "source":           "iot",
        "note":             "Confirmed by hardware pill dispenser",
        "window_state":     status.value,
        "device_id":        device_id,
        "dedupe_key":       dedupe_key,
        "confirmed_via":    "pillbox_button"
    })

    logger.info(f"[ESP] ✅ {medicine_name} taken by {patient_id} (Server Auth: {status.value})")
    
    resp = {
        "ok":        True,
        "status":    "active",
        "source":    "iot",
        "slot":       slot,
        "message":   f"{medicine_name.capitalize()} medicine confirmed successfully"
    }
    
    # Demo visibility extension
    if os.getenv("DEMO_MODE", "false").lower() == "true":
        resp["debug"] = {
            "server_time": now_ist.isoformat(),
            "window_state": status.value,
            "resolved_slot": slot,
            "duplicate_protection_active": True
        }
        
    return resp
