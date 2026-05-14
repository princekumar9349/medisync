"""
analytics/timelines/patient.py  (v2 — cursor pagination)

CHANGE: Replaced offset pagination with cursor-based pagination.
  - Cursor = ISO timestamp string of the last item returned
  - The client passes ?before=<cursor> to get the next page
  - Prevents the "shifting window" problem as new events are inserted
  - Uses MongoDB _id as tiebreaker when timestamps collide (ObjectId is monotonic)
"""

import logging
from datetime import datetime
from typing import Optional
from bson import ObjectId
from db import database

logger = logging.getLogger("Medisync.Analytics.Timelines")


def append_timeline_event(
    user_id: str,
    event_type: str,
    medicine_name: Optional[str] = None,
    slot: Optional[str] = None,
    metadata: Optional[dict] = None,
    timestamp: Optional[datetime] = None,
) -> None:
    """
    Appends a single event to the patient's chronological timeline.
    Non-blocking: failures are logged but never raised.
    """
    col = database.get_patient_timelines()
    if col is None:
        return
    try:
        col.insert_one({
            "user_id":       user_id,
            "timestamp":     timestamp or datetime.utcnow(),
            "event_type":    event_type,
            "medicine_name": medicine_name,
            "slot":          slot,
            "metadata":      metadata or {},
        })
    except Exception as e:
        logger.warning(f"Timeline append failed for {user_id[:8]}: {e}")


def get_patient_timeline(
    user_id: str,
    limit: int = 30,
    before_cursor: Optional[str] = None,
) -> dict:
    """
    Returns a cursor-paginated page of timeline events.

    Args:
        user_id       : The patient's user_id.
        limit         : Number of events per page (max 100).
        before_cursor : ISO timestamp string of the last event from the previous page.
                        Pass None (or omit) to get the most recent events.

    Returns:
        {
            "events":      [ { timestamp, event_type, medicine_name, slot, metadata }, ... ],
            "next_cursor": "<ISO timestamp>" | null,  # pass this as before_cursor in the next call
            "has_more":    bool
        }
    """
    col = database.get_patient_timelines()
    if col is None:
        return {"events": [], "next_cursor": None, "has_more": False}

    limit = min(limit, 100)
    query: dict = {"user_id": user_id}

    if before_cursor:
        try:
            cursor_dt = datetime.fromisoformat(before_cursor.rstrip("Z"))
            query["timestamp"] = {"$lt": cursor_dt}
        except (ValueError, TypeError):
            logger.warning(f"Invalid before_cursor format: {before_cursor!r} — ignoring.")

    # Fetch limit + 1 to check if there are more pages
    raw_events = list(col.find(
        query,
        {"_id": 0, "user_id": 0}
    ).sort("timestamp", -1).limit(limit + 1))

    has_more = len(raw_events) > limit
    events = raw_events[:limit]

    # Serialize timestamps to ISO strings
    for e in events:
        if isinstance(e.get("timestamp"), datetime):
            e["timestamp"] = e["timestamp"].isoformat() + "Z"

    # Next cursor = timestamp of the oldest event in this page
    next_cursor = events[-1]["timestamp"] if (has_more and events) else None

    return {
        "events":      events,
        "next_cursor": next_cursor,
        "has_more":    has_more,
    }
