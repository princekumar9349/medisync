"""
services/scheduler.py — Background reminder system for Medisync.

Uses APScheduler to run periodic jobs:
  - check_and_send_reminders(): Runs every 30 minutes
    → Scans active prescriptions for upcoming/missed doses
    → Logs reminder events to dose_logs
    → Future-ready hook for push notifications

Usage:
    from services.scheduler import start_scheduler
    start_scheduler()   # called once at app startup
"""

import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from db import database

logger = logging.getLogger("Medisync.Scheduler")

# Singleton scheduler instance
_scheduler = BackgroundScheduler(timezone="UTC")


# ─── Core Job ─────────────────────────────────────────────────────────────────

def check_and_send_reminders() -> None:
    """
    Periodic job that runs every 30 minutes.

    Logic:
      1. Find all prescriptions with non-expired medicines
      2. For each prescription, check if a scheduled dose time is upcoming
         (within the next 30 minutes) or was recently missed (past 30 min)
      3. Log a 'reminder_sent' event in dose_logs if not already logged today
      4. TODO: Trigger push notifications / SMS via future /notify hook
    """
    prescriptions_col = database.get_prescriptions()
    dose_logs_col = database.get_dose_logs()

    if prescriptions_col is None or dose_logs_col is None:
        logger.debug("Scheduler: MongoDB unavailable — skipping reminder check.")
        return

    now = datetime.utcnow()
    window_start = now
    window_end = now + timedelta(minutes=30)

    # Slot → approximate UTC hours (rough mapping, real apps use user timezone)
    SLOT_HOURS = {
        "morning": 7,
        "afternoon": 13,
        "night": 21,
    }

    logger.info(f"Scheduler running reminder check at {now.strftime('%H:%M UTC')}")

    try:
        # Fetch prescriptions that are not yet fully expired
        active_prescriptions = list(
            prescriptions_col.find(
                {},
                {"_id": 1, "user_id": 1, "medicines": 1}
            )
        )

        reminder_count = 0

        for prescription in active_prescriptions:
            user_id = prescription.get("user_id")
            if not user_id:
                continue   # skip anonymous prescriptions

            for med in prescription.get("medicines", []):
                med_name = med.get("name", "Unknown")
                expiry = med.get("expiry_date")

                # Skip expired medicines
                if expiry and expiry < now:
                    continue

                for slot in med.get("schedule", []):
                    slot_hour = SLOT_HOURS.get(slot)
                    if slot_hour is None:
                        continue

                    # Check if this slot falls in the upcoming 30-minute window
                    slot_time_today = now.replace(
                        hour=slot_hour, minute=0, second=0, microsecond=0
                    )

                    if window_start <= slot_time_today <= window_end:
                        # Check if reminder was already sent today for this slot
                        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                        already_logged = dose_logs_col.find_one({
                            "user_id": user_id,
                            "medicine_name": med_name,
                            "status": "reminder_sent",
                            "timestamp": {"$gte": today_start},
                            "note": slot,
                        })

                        if not already_logged:
                            # Log the reminder event
                            dose_logs_col.insert_one({
                                "user_id": user_id,
                                "med_id": str(prescription["_id"]),
                                "medicine_name": med_name,
                                "status": "reminder_sent",
                                "timestamp": now,
                                "note": slot,
                            })
                            logger.info(
                                f"🔔 Reminder logged: {med_name} ({slot}) "
                                f"for user {str(user_id)[:8]}..."
                            )
                            reminder_count += 1

                            # ── Send actual Expo push notification ──────────────
                            _send_push_to_user(user_id, med_name, slot)

        if reminder_count:
            logger.info(f"Scheduler: {reminder_count} reminder(s) sent this cycle.")
        else:
            logger.info("Scheduler: No reminders needed this cycle.")

    except Exception as e:
        logger.error(f" Scheduler error: {e}", exc_info=True)


# ─── Startup ──────────────────────────────────────────────────────────────────

def start_scheduler() -> None:
    """
    Initialize and start the APScheduler background scheduler.

    Adds the reminder check job to run every 30 minutes.
    Safe to call multiple times (guards against double-start).
    """
    if _scheduler.running:
        logger.info("Scheduler already running — skipping start.")
        return

    _scheduler.add_job(
        func=check_and_send_reminders,
        trigger=IntervalTrigger(minutes=30),
        id="medication_reminder",
        name="Medication Dose Reminder Check",
        replace_existing=True,
        max_instances=1,             # prevent overlap if job is slow
    )

    _scheduler.start()
    logger.info(" Medication reminder scheduler started (every 30 minutes).")


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler (called on app shutdown)."""
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info(" Scheduler stopped.")


# ─── Push Notification Helper ─────────────────────────────────────────────────

def _send_push_to_user(user_id: str, med_name: str, slot: str) -> None:
    """
    Look up the user's Expo push token and send a real-time push notification.
    Silently skips if the user hasn't registered a push token.
    """
    try:
        users_col = database.get_users()
        if users_col is None:
            return

        from bson import ObjectId
        user = users_col.find_one({"_id": ObjectId(user_id)}, {"expo_push_token": 1})
        if not user or not user.get("expo_push_token"):
            return  # User hasn't registered a push token yet

        slot_emoji = {"morning": "🌅", "afternoon": "☀️", "night": "🌙"}.get(slot, "⏰")
        title = f"{slot_emoji} Medication Reminder"
        body = f"Time to take your {med_name} ({slot}). Don't forget!"

        from routers.voice import send_push_sync
        send_push_sync(
            token=user["expo_push_token"],
            title=title,
            body=body,
            data={"med_name": med_name, "slot": slot, "type": "medication_reminder"},
        )
    except Exception as e:
        logger.warning(f" Could not send push for user {str(user_id)[:8]}: {e}")

