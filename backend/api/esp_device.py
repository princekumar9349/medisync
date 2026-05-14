"""
api/esp_device.py — ESP8266/ESP32 Hardware Device Integration
No JWT needed — Simple API Key via query param (easiest for ESP hardware)
"""
import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query

from db import database

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

# ─── IST helpers ─────────────────────────────────────────────────────────────
def _now_ist() -> datetime:
    return datetime.now(tz=timezone.utc).astimezone(IST)

def _today_utc_midnight() -> datetime:
    now_ist = _now_ist()
    ist_midnight = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    return ist_midnight.astimezone(timezone.utc)

# ─── Slot config ─────────────────────────────────────────────────────────────
SLOTS = {
    "morning":   {"open_h": 7,  "open_m": 0,  "close_h": 11, "close_m": 0,  "display": "08:00"},
    "afternoon": {"open_h": 12, "open_m": 0,  "close_h": 16, "close_m": 0,  "display": "13:00"},
    "night":     {"open_h": 20, "open_m": 0,  "close_h": 23, "close_m": 30, "display": "21:00"},
}

def _slot_status(slot_key: str, now_ist: datetime):
    w = SLOTS[slot_key]
    t_open  = now_ist.replace(hour=w["open_h"],  minute=w["open_m"],  second=0, microsecond=0)
    t_close = now_ist.replace(hour=w["close_h"], minute=w["close_m"], second=0, microsecond=0)
    if now_ist < t_open:    return "upcoming", False
    if now_ist <= t_close:  return "active",   True
    return "missed", False

def _resolve_slots(med: dict) -> list:
    s = med.get("schedule", [])
    slots = [x for x in s if x in SLOTS]
    if not slots:
        if med.get("morning"):   slots.append("morning")
        if med.get("afternoon"): slots.append("afternoon")
        if med.get("night"):     slots.append("night")
    return slots or ["morning"]

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
        "time_ist": _now_ist().strftime("%H:%M:%S IST"),
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
    now_ist   = _now_ist()
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
                status, can_take = _slot_status(slot, now_ist)
                if status == "missed":
                    missed_today.append(name)

            entry = {
                "name":        name,
                "dosage":      dosage,
                "slot":        slot,
                "time":        SLOTS[slot]["display"],
                "status":      status,
                "can_take":    can_take,
                "is_critical": is_crit,
            }
            medicines_out.append(entry)

            if status == "active":
                active_now.append({"name": name, "slot": slot, "time": SLOTS[slot]["display"]})

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
def device_confirm_taken(
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
    today_utc = _today_utc_midnight()

    # Idempotency
    existing = dose_logs_col.find_one({
        "user_id":   user_id,
        "med_id":    med_id,
        "timestamp": {"$gte": today_utc},
    })
    if existing and existing.get("status") == "taken":
        return {"ok": True, "message": "Already taken today", "duplicate": True}

    dose_logs_col.insert_one({
        "user_id":       user_id,
        "med_id":        med_id,
        "medicine_name": medicine_name.strip(),
        "status":        "taken",
        "slot":          slot,
        "timestamp":     now_utc,
        "source":        "esp_device",
        "note":          "Confirmed by hardware pill dispenser",
    })

    logger.info(f"[ESP] ✅ {medicine_name} taken by {patient_id}")
    return {
        "ok":        True,
        "message":   f"{medicine_name} marked as taken",
        "patient_id": patient_id,
        "slot":       slot,
        "logged_at":  now_utc.isoformat(),
    }
