"""
analytics/workers/cron.py

APScheduler background jobs for analytics aggregation.

Jobs:
  1. Nightly Full Recompute  (02:00 UTC daily)
     → Rebuilds all analytics_snapshots from scratch for active users
  2. Hourly Incremental Sync (every 60 min)
     → Catches any gaps from dropped real-time events
     → Only processes users with activity in the last 2 hours
"""

import logging
from datetime import datetime, timedelta
from db import database
from analytics.snapshots.manager import refresh_user_snapshot

logger = logging.getLogger("Medisync.Analytics.Worker")


def nightly_full_recompute() -> None:
    """
    Full snapshot recompute for all users who have dose activity in the last 30 days.
    Runs at 02:00 UTC daily via APScheduler.
    """
    now = datetime.utcnow()
    logger.info("🌙 Analytics: Nightly full recompute started...")

    dose_logs_col = database.get_dose_logs()
    if dose_logs_col is None:
        logger.warning("Analytics Worker: MongoDB unavailable — skipping nightly recompute.")
        return

    # Find all distinct user_ids with activity in the last 30 days
    thirty_days_ago = now - timedelta(days=30)
    active_user_ids = dose_logs_col.distinct(
        "user_id",
        {"timestamp": {"$gte": thirty_days_ago}}
    )

    if not active_user_ids:
        logger.info("Analytics Worker: No active users found — nothing to recompute.")
        return

    success_count = 0
    fail_count = 0
    for user_id in active_user_ids:
        try:
            refresh_user_snapshot(str(user_id), force=True, now=now)
            success_count += 1
        except Exception as e:
            logger.error(f"Nightly recompute failed for user {str(user_id)[:8]}: {e}")
            fail_count += 1

    logger.info(
        f"✅ Analytics: Nightly recompute complete. "
        f"Users: {len(active_user_ids)} | Success: {success_count} | Failed: {fail_count}"
    )


def hourly_incremental_sync() -> None:
    """
    Incremental sync for users with very recent dose activity (last 2 hours).
    Plugs any gaps from dropped real-time event bus events.
    """
    now = datetime.utcnow()
    two_hours_ago = now - timedelta(hours=2)

    dose_logs_col = database.get_dose_logs()
    if dose_logs_col is None:
        return

    recent_user_ids = dose_logs_col.distinct(
        "user_id",
        {"timestamp": {"$gte": two_hours_ago}}
    )

    if not recent_user_ids:
        return

    logger.info(f"Analytics: Hourly sync for {len(recent_user_ids)} recently active users.")

    for user_id in recent_user_ids:
        try:
            # force=False lets the TTL guard decide if recompute is actually needed
            refresh_user_snapshot(str(user_id), force=False, now=now)
        except Exception as e:
            logger.warning(f"Hourly sync failed for user {str(user_id)[:8]}: {e}")


def register_analytics_jobs(scheduler) -> None:
    """
    Registers analytics cron jobs with an existing APScheduler instance.
    Called from workers/scheduler.py at startup.
    """
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger

    scheduler.add_job(
        func=nightly_full_recompute,
        trigger=CronTrigger(hour=2, minute=0),
        id="analytics_nightly_recompute",
        name="Analytics: Nightly Full Snapshot Recompute",
        replace_existing=True,
        max_instances=1,
    )

    scheduler.add_job(
        func=hourly_incremental_sync,
        trigger=IntervalTrigger(minutes=60),
        id="analytics_hourly_sync",
        name="Analytics: Hourly Incremental Sync",
        replace_existing=True,
        max_instances=1,
    )

    logger.info("📊 Analytics workers registered: nightly recompute + hourly sync.")
