"""
analytics/aggregators/adherence.py

Event-driven adherence aggregator.
Subscribes to DOSE_TAKEN, DOSE_MISSED, DOSE_SKIPPED, ESCALATION_TRIGGERED.

On each event:
  1. Appends to patient_timelines (chronological audit log)
  2. Increments snapshot counters atomically (no full recompute)
  3. Schedules a full snapshot refresh every hour via the TTL guard in manager.py
"""

import logging
from datetime import datetime
from analytics.snapshots.manager import increment_dose_taken, increment_dose_missed, refresh_user_snapshot
from analytics.timelines.patient import append_timeline_event

logger = logging.getLogger("Medisync.Analytics.AdherenceAggregator")


async def on_dose_event(payload: dict) -> None:
    """
    Async event subscriber for all dose-related domain events.
    Payload fields: user_id, medicine_name, slot, status, timestamp, event_type
    """
    user_id      = payload.get("user_id")
    medicine     = payload.get("medicine_name", "Unknown")
    slot         = payload.get("slot", "")
    status       = payload.get("status", "")
    event_type   = payload.get("event_type", "DOSE_EVENT")
    timestamp    = payload.get("timestamp", datetime.utcnow())

    if not user_id:
        logger.warning("on_dose_event: missing user_id in payload")
        return

    # 1. Append to patient timeline (for visualization)
    append_timeline_event(
        user_id=user_id,
        event_type=event_type,
        medicine_name=medicine,
        slot=slot,
        metadata={"status": status},
        timestamp=timestamp,
    )

    # 2. Incremental snapshot counter update
    if status == "taken":
        increment_dose_taken(user_id)
    elif status == "missed":
        increment_dose_missed(user_id)

    # 3. Trigger a full snapshot refresh (TTL guard will skip if fresh enough)
    # We run this non-blocking — the guard prevents thundering-herd recalculation
    try:
        refresh_user_snapshot(user_id, force=False)
    except Exception as e:
        logger.error(f"Background snapshot refresh failed for {user_id[:8]}: {e}")


async def on_escalation_event(payload: dict) -> None:
    """Subscriber for ESCALATION_TRIGGERED events."""
    user_id    = payload.get("user_id")
    medicine   = payload.get("medicine_name", "Unknown")
    level      = payload.get("escalation_level", "UNKNOWN")
    timestamp  = payload.get("timestamp", datetime.utcnow())

    if not user_id:
        return

    append_timeline_event(
        user_id=user_id,
        event_type="ESCALATION_TRIGGERED",
        medicine_name=medicine,
        metadata={"level": level},
        timestamp=timestamp,
    )

    try:
        refresh_user_snapshot(user_id, force=False)
    except Exception as e:
        logger.error(f"Escalation snapshot refresh failed for {user_id[:8]}: {e}")
