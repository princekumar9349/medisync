from enum import Enum
from datetime import datetime, timedelta, timezone
from typing import Tuple

IST = timezone(timedelta(hours=5, minutes=30))

class AdherenceState(str, Enum):
    UPCOMING = "upcoming"
    ACTIVE = "active"
    LATE = "late"
    MISSED = "missed"
    TAKEN = "taken"
    ALREADY_TAKEN = "already_taken"
    SKIPPED = "skipped"
    ESCALATED = "escalated"

# Centralized Window Definitions (IST)
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

def _today_utc_midnight() -> datetime:
    now_ist = _ist_now()
    ist_midnight = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    return ist_midnight.astimezone(timezone.utc)

def compute_slot_state(slot_key: str, now_ist: datetime = None) -> Tuple[AdherenceState, bool]:
    """
    Evaluates the state of a slot based purely on time (independent of database state).
    Returns (State, can_take_boolean).
    """
    if now_ist is None:
        now_ist = _ist_now()
        
    if slot_key not in SLOT_WINDOWS:
        # Default fallback if unknown slot is somehow passed
        return AdherenceState.ACTIVE, True
        
    w = SLOT_WINDOWS[slot_key]
    t_open  = _ist_today_ts(*w["open"])
    t_late  = _ist_today_ts(*w["late"])
    t_close = _ist_today_ts(*w["close"])

    if slot_key == "night" and w["close"] == (23, 30):
        t_close = _ist_today_ts(23, 30)

    if now_ist < t_open:
        return AdherenceState.UPCOMING, False
    elif t_open <= now_ist < t_late:
        return AdherenceState.ACTIVE, True
    elif t_late <= now_ist < t_close:
        return AdherenceState.LATE, True
    else:
        return AdherenceState.MISSED, False
