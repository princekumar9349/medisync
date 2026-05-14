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
    Periodic job that runs every 15 minutes.

    Escalation Logic:
      - 15 min late: Standard push notification
      - 30 min late: Persistent voice reminder (push)
      - 60 min late: AI Automated phone call
      - Repeated misses (3+ in 24h): Caregiver SMS escalation
    """
    prescriptions_col = database.get_prescriptions()
    dose_logs_col = database.get_dose_logs()
    users_col = database.get_users()

    if prescriptions_col is None or dose_logs_col is None or users_col is None:
        logger.debug("Scheduler: MongoDB unavailable — skipping reminder check.")
        return

    now = datetime.utcnow()

    # Slot → approximate UTC hours (real apps use user timezone, using dummy mapping here)
    SLOT_HOURS = {
        "morning": 7,
        "afternoon": 13,
        "night": 21,
    }

    logger.info(f"Scheduler running reminder check at {now.strftime('%H:%M UTC')}")

    try:
        active_prescriptions = list(
            prescriptions_col.find(
                {},
                {"_id": 1, "user_id": 1, "medicines": 1}
            )
        )

        for prescription in active_prescriptions:
            user_id = prescription.get("user_id")
            if not user_id:
                continue

            # Fetch user to check calling preferences & caregiver
            from bson import ObjectId
            user = users_col.find_one({"_id": ObjectId(user_id)})
            if not user:
                continue

            prefs = user.get("calling_preferences", {})
            phone = user.get("phone")
            phone_verified = user.get("phone_verified", False)
            caregiver_phone = user.get("caregiver_phone")

            for med in prescription.get("medicines", []):
                med_name = med.get("name", "Unknown")
                expiry = med.get("expiry_date")

                if expiry and expiry < now:
                    continue

                for slot in med.get("schedule", []):
                    slot_hour = SLOT_HOURS.get(slot)
                    if slot_hour is None:
                        continue

                    slot_time_today = now.replace(
                        hour=slot_hour, minute=0, second=0, microsecond=0
                    )
                    
                    # Prevent checking future slots
                    if now < slot_time_today:
                        continue

                    delay_minutes = (now - slot_time_today).total_seconds() / 60.0
                    
                    # Check if already taken or skipped
                    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                    already_handled = dose_logs_col.find_one({
                        "user_id": user_id,
                        "medicine_name": med_name,
                        "status": {"$in": ["taken", "skipped"]},
                        "timestamp": {"$gte": today_start},
                        "note": slot,
                    })
                    
                    if already_handled:
                        continue

                    # Delegate to the new domain-driven escalation engine
                    from escalation.engine import evaluate_dose
                    is_critical = med.get("priority") == "critical"
                    fcm_tokens = [t["token"] for t in user.get("fcm_tokens", []) if "token" in t]
                    evaluate_dose(
                        user_id=str(user_id),
                        med_name=med_name,
                        slot=slot,
                        med_id=str(prescription["_id"]),
                        slot_time=slot_time_today,
                        now=now,
                        is_critical=is_critical,
                        caregiver_phone=caregiver_phone,
                        expo_push_token=user.get("expo_push_token"),
                        fcm_tokens=fcm_tokens
                    )

            # Check for Caregiver Escalation (3+ missed/escalated doses in 24h)
            if prefs.get("caregiver_escalation") and caregiver_phone:
                yesterday = now - timedelta(days=1)
                misses_last_24h = dose_logs_col.count_documents({
                    "user_id": user_id,
                    "status": {"$in": ["missed", "escalated_ai_call"]},
                    "timestamp": {"$gte": yesterday}
                })
                
                if misses_last_24h >= 3:
                    caregiver_logged = dose_logs_col.find_one({
                        "user_id": user_id,
                        "status": "escalated_caregiver",
                        "timestamp": {"$gte": yesterday}
                    })
                    
                    if not caregiver_logged:
                        dose_logs_col.insert_one({
                            "user_id": user_id,
                            "med_id": "N/A",
                            "medicine_name": "Multiple",
                            "status": "escalated_caregiver",
                            "timestamp": now,
                            "note": f"{misses_last_24h} misses in 24h"
                        })
                        
                        logger.warning(f"Caregiver escalation triggered for user {str(user_id)[:8]}!")
                        from services.voice_provider import voice_client
                        patient_name = user.get("name", "The patient")
                        msg = f"MediSync Alert: {patient_name} has missed multiple medication doses in the last 24 hours. Please check on them."
                        voice_client.send_sms(caregiver_phone, msg)
                        
                        call_logs_col = database.get_call_logs()
                        if call_logs_col is not None:
                            call_logs_col.insert_one({
                                "user_id": user_id,
                                "caregiver_phone": caregiver_phone,
                                "timestamp": now,
                                "type": "caregiver_sms"
                            })

    except Exception as e:
        logger.error(f" Scheduler error: {e}", exc_info=True)


# ─── Startup ──────────────────────────────────────────────────────────────────

def start_scheduler() -> None:
    """
    Initialize and start the APScheduler background scheduler.

    Adds the reminder check job to run every 15 minutes.
    Safe to call multiple times (guards against double-start).
    """
    if _scheduler.running:
        logger.info("Scheduler already running — skipping start.")
        return

    _scheduler.add_job(
        func=check_and_send_reminders,
        trigger=IntervalTrigger(minutes=1),
        id="medication_reminder",
        name="Medication Dose Reminder Check",
        replace_existing=True,
        max_instances=1,
    )

    # Register analytics aggregation workers
    from analytics.workers.cron import register_analytics_jobs
    register_analytics_jobs(_scheduler)

    _scheduler.start()
    logger.info("Medication reminder scheduler started (every 1 minute).")


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler (called on app shutdown)."""
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info(" Scheduler stopped.")


# ─── Push Notification Helper ─────────────────────────────────────────────────

def _send_push_to_user(user_id: str, med_name: str, slot: str, med_id: str, escalation_level: str) -> None:
    """
    Look up the user's Expo push token and send a real-time push notification.
    Silently skips if the user hasn't registered a push token.
    """
    try:
        users_col = database.get_users()
        if users_col is None:
            return

        from bson import ObjectId
        user = users_col.find_one({"_id": ObjectId(user_id)}, {"expo_push_token": 1, "fcm_tokens": 1})
        if not user:
            return

        title = "Medication Reminder"
        body = f"Time to take your {med_name} ({slot})."
        msg_type = "medicine_reminder"

        if escalation_level == "safe":
            title = f"💊 Upcoming: {med_name}"
            body = f"Your {slot} dose is due in 15 minutes."
        elif escalation_level == "due_soon":
            title = f"⏰ Due Soon: {med_name}"
            body = f"Please prepare to take your {slot} dose in 5 mins."
        elif escalation_level == "critical":
            title = f"❗ Due Now: {med_name}"
            body = f"It's time for your {slot} {med_name}!"
        elif escalation_level == "missed":
            title = f"⚠️ Missed Dose: {med_name}"
            body = f"You are 10 minutes late for {med_name}. Please log it."
        elif escalation_level == "voice_reminder":
            title = f"🚨 URGENT: Missed {med_name}!"
            body = f"You are 30+ minutes late. Please take it now."

        # Send via FCM explicitly if fcm_tokens exist
        from routers.notifications import _send_fcm_push
        fcm_tokens = [t["token"] for t in user.get("fcm_tokens", []) if "token" in t]
        
        data_payload = {
            "type": msg_type,
            "medicineId": med_id,
            "med_name": med_name,
            "slot": slot,
            "escalation": escalation_level
        }

        if fcm_tokens:
            _send_fcm_push(fcm_tokens, title, body, data=data_payload)
            
        # Fallback to expo_push_token for older clients
        if user.get("expo_push_token"):
            from routers.voice import send_push_sync
            send_push_sync(
                token=user["expo_push_token"],
                title=title,
                body=body,
                data=data_payload,
            )
    except Exception as e:
        logger.warning(f" Could not send push for user {str(user_id)[:8]}: {e}")

