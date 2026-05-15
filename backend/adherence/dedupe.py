from datetime import datetime, timezone
from adherence.state_machine import AdherenceState

def check_idempotency(dose_logs_col, user_id: str, med_id: str, slot: str) -> dict:
    """
    Checks if a dose has already been taken today (IST midnight to now).
    Returns a dict with `is_duplicate` and `status` if a duplicate exists.
    """
    from adherence.state_machine import _ist_now
    now_ist = _ist_now()
    today_ist_midnight = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    today_utc = today_ist_midnight.astimezone(timezone.utc)

    query = {"user_id": user_id, "med_id": med_id, "timestamp": {"$gte": today_utc}}
    if slot:
        query["slot"] = slot

    existing = dose_logs_col.find_one(
        query,
        sort=[("timestamp", -1)],
    )

    if existing and existing.get("status") in (AdherenceState.TAKEN.value, AdherenceState.SKIPPED.value):
        return {
            "is_duplicate": True,
            "status": existing["status"],
            "existing_log": existing
        }

    return {"is_duplicate": False}
