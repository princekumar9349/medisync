"""
analytics/snapshots/manager.py  (v2 — hardened)

KEY HARDENING CHANGES vs v1:
  - analytics_schema_version field added to every snapshot
  - Atomic $inc updates never do read-modify-write (race-condition safe)
  - invalidate_user_snapshot() for targeted cache busting on dose/medicine/schedule edits
  - TTL guard is documented and enforced per version
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

from db import database
from analytics.scoring.adherence_score import compute_adherence_score
from analytics.scoring.risk_score import compute_risk_score

logger = logging.getLogger("Medisync.Analytics.Snapshots")

# Current schema version — increment when scoring logic or fields change
ANALYTICS_SCHEMA_VERSION = 2

# Minimum age (minutes) before a TTL-guarded full recompute can fire again
_FULL_RECOMPUTE_TTL_MINUTES = 60


def refresh_user_snapshot(user_id: str, force: bool = False, now: Optional[datetime] = None) -> dict | None:
    """
    Recomputes and upserts the analytics snapshot for the given user.
    Thread-safe: uses atomic upsert — never reads then writes without the DB as the arbiter.

    Args:
        user_id : Patient user_id string.
        force   : Bypass TTL guard (used by nightly batch worker and invalidation events).
        now     : Override current time (testing / batch workers).
    """
    if now is None:
        now = datetime.utcnow()

    col = database.get_analytics_snapshots()
    if col is None:
        return None

    # ── TTL Guard ────────────────────────────────────────────────────────────
    if not force:
        existing = col.find_one(
            {"user_id": user_id},
            {"updated_at": 1, "analytics_schema_version": 1}
        )
        if existing:
            existing_version = existing.get("analytics_schema_version", 0)
            age_minutes = (now - existing["updated_at"]).total_seconds() / 60

            # Force recompute if schema has changed, even within TTL window
            if existing_version < ANALYTICS_SCHEMA_VERSION:
                logger.info(
                    f"Schema version mismatch for {user_id[:8]} "
                    f"(v{existing_version} → v{ANALYTICS_SCHEMA_VERSION}) — forcing recompute."
                )
            elif age_minutes < _FULL_RECOMPUTE_TTL_MINUTES:
                logger.debug(
                    f"Snapshot for {user_id[:8]} is {age_minutes:.1f}min old and schema v{existing_version} is current — skipping."
                )
                return col.find_one({"user_id": user_id}, {"_id": 0})

    # ── Compute Scores ────────────────────────────────────────────────────────
    try:
        adherence_7d  = compute_adherence_score(user_id, window_days=7,  now=now)
        adherence_30d = compute_adherence_score(user_id, window_days=30, now=now)
        risk          = compute_risk_score(user_id, now=now)
        notification  = _compute_notification_metrics(user_id, now)
        caregiver     = _compute_caregiver_metrics(user_id, now)
    except Exception as e:
        logger.error(f"Snapshot computation failed for user {user_id[:8]}: {e}", exc_info=True)
        return None

    snapshot = {
        "user_id":                  user_id,
        "updated_at":               now,
        "analytics_schema_version": ANALYTICS_SCHEMA_VERSION,
        "adherence": {
            "score_7d":          adherence_7d["score_pct"],
            "score_30d":         adherence_30d["score_pct"],
            "consistency_score": adherence_7d["consistency_score"],
            "streak_current":    adherence_7d["streak_current"],
            "streak_longest":    adherence_7d["streak_longest"],
            "confidence":        adherence_30d["confidence"],
            "taken_7d":          adherence_7d["taken"],
            "total_7d":          adherence_7d["total"],
        },
        "risk": {
            "level":          risk["level"],
            "score":          risk["score"],
            "factors":        risk["factors"],
            "missed_7d":      risk["missed_7d"],
            "escalations_7d": risk["escalations_7d"],
        },
        "notification": notification,
        "caregiver":    caregiver,
    }

    # ── Atomic Upsert — never read-modify-write ───────────────────────────────
    col.update_one(
        {"user_id": user_id},
        {"$set": snapshot},
        upsert=True
    )
    logger.info(
        f"Snapshot v{ANALYTICS_SCHEMA_VERSION} refreshed for {user_id[:8]} "
        f"| Risk: {risk['level']} | 7d: {adherence_7d['score_pct']}%"
    )
    return snapshot


def invalidate_user_snapshot(user_id: str, reason: str = "data_change") -> None:
    """
    Targeted cache invalidation: resets updated_at to epoch so the next API
    request triggers an immediate full recompute.

    Call this when:
      - A dose log is edited
      - A medicine is deleted from a prescription
      - A schedule is modified

    This is intentionally CHEAP — just one atomic $set, no recompute.
    The recompute is deferred to the next API read or the next hourly sync job.
    """
    col = database.get_analytics_snapshots()
    if col is None:
        return

    # Set updated_at to epoch → guaranteed to exceed the TTL guard
    from datetime import timezone
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc).replace(tzinfo=None)

    col.update_one(
        {"user_id": user_id},
        {"$set": {"updated_at": epoch, "_invalidated_reason": reason}},
    )
    logger.info(f"Snapshot invalidated for {user_id[:8]} (reason: {reason})")


def increment_dose_taken(user_id: str) -> None:
    """
    Lightweight real-time increment when DOSE_TAKEN event fires.
    Uses pure $inc — fully atomic, no read-before-write.
    """
    col = database.get_analytics_snapshots()
    if col is None:
        return
    col.update_one(
        {"user_id": user_id},
        {
            "$inc": {"adherence.taken_7d": 1, "adherence.total_7d": 1},
            "$set": {"updated_at": datetime.utcnow()},
            "$setOnInsert": {"analytics_schema_version": ANALYTICS_SCHEMA_VERSION}
        },
        upsert=True
    )


def increment_dose_missed(user_id: str) -> None:
    """
    Lightweight real-time increment when DOSE_MISSED event fires.
    Uses pure $inc — fully atomic, no read-before-write.
    """
    col = database.get_analytics_snapshots()
    if col is None:
        return
    col.update_one(
        {"user_id": user_id},
        {
            "$inc": {"adherence.total_7d": 1, "risk.missed_7d": 1},
            "$set": {"updated_at": datetime.utcnow()},
            "$setOnInsert": {"analytics_schema_version": ANALYTICS_SCHEMA_VERSION}
        },
        upsert=True
    )


# ── Internal Helpers ──────────────────────────────────────────────────────────

def _compute_notification_metrics(user_id: str, now: datetime) -> dict:
    col = database.get_notifications()
    if col is None:
        return {"sent_7d": 0, "tapped_7d": 0, "tap_through_rate": 0.0, "ignored_7d": 0}

    seven_days_ago = now - timedelta(days=7)
    sent   = col.count_documents({"user_id": user_id, "created_at": {"$gte": seven_days_ago}})
    tapped = col.count_documents({"user_id": user_id, "tapped": True, "created_at": {"$gte": seven_days_ago}})

    return {
        "sent_7d":         sent,
        "tapped_7d":       tapped,
        "tap_through_rate": round(tapped / sent, 3) if sent > 0 else 0.0,
        "ignored_7d":      max(0, sent - tapped),
    }


def _compute_caregiver_metrics(user_id: str, now: datetime) -> dict:
    dose_logs_col = database.get_dose_logs()
    if dose_logs_col is None:
        return {"alerts_sent_7d": 0, "avg_response_latency_min": None, "interventions_7d": 0}

    seven_days_ago = now - timedelta(days=7)
    alerts = dose_logs_col.count_documents({
        "user_id": user_id,
        "status":  {"$in": ["escalated_caregiver", "escalated_ai_call"]},
        "timestamp": {"$gte": seven_days_ago}
    })
    return {
        "alerts_sent_7d":          alerts,
        "avg_response_latency_min": None,
        "interventions_7d":        alerts,
    }
