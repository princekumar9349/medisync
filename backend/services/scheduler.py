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
                    
                    # Only process if delay is within the 0 to 90 min window to avoid infinite loops
                    if not (0 <= delay_minutes <= 90):
                        continue

                    # Determine escalation level
                    escalation_level = None
                    if 15 <= delay_minutes < 30:
                        escalation_level = "notification"
                    elif 30 <= delay_minutes < 60:
                        escalation_level = "voice_reminder"
                    elif 60 <= delay_minutes <= 90:
                        escalation_level = "ai_call"

                    if not escalation_level:
                        continue

                    # Check if this specific escalation was already logged today
                    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                    already_logged = dose_logs_col.find_one({
                        "user_id": user_id,
                        "medicine_name": med_name,
                        "status": f"escalated_{escalation_level}",
                        "timestamp": {"$gte": today_start},
                        "note": slot,
                    })

                    if not already_logged:
                        # Log it
                        dose_logs_col.insert_one({
                            "user_id": user_id,
                            "med_id": str(prescription["_id"]),
                            "medicine_name": med_name,
                            "status": f"escalated_{escalation_level}",
                            "timestamp": now,
                            "note": slot,
                            "delay_minutes": int(delay_minutes)
                        })
                        
                        logger.info(f"Escalation [{escalation_level}] for {med_name} ({slot}) user {str(user_id)[:8]}")

                        # Execute escalation
                        if escalation_level == "notification":
                            _send_push_to_user(user_id, med_name, slot, is_voice_reminder=False)
                        elif escalation_level == "voice_reminder":
                            _send_push_to_user(user_id, med_name, slot, is_voice_reminder=True)
                        elif escalation_level == "ai_call":
                            # Check quiet hours (simplified check)
                            in_quiet_hours = False # Could implement real check using prefs.get("quiet_hours_start")
                            
                            if prefs.get("enable_auto_calling") and phone_verified and not in_quiet_hours:
                                from services.voice_provider import voice_client
                                lang = prefs.get("language", "en")
                                
                                if lang == "hi":
                                    msg = f"नमस्ते {user.get('name', '')}, यह मेडिसिंक है। आपने अपनी {med_name} दवाई नहीं ली है। कृपया इसे जल्द लें।"
                                else:
                                    msg = f"Hello {user.get('name', '')}, this is your MediSync health assistant. You missed your {slot} {med_name}. Please take it as soon as possible."
                                
                                voice_client.send_call(phone, msg)
                                
                                # Log call
                                call_logs_col = database.get_call_logs()
                                if call_logs_col is not None:
                                    call_logs_col.insert_one({
                                        "user_id": user_id,
                                        "phone": phone,
                                        "medicine": med_name,
                                        "timestamp": now,
                                        "type": "ai_call_reminder"
                                    })

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
        trigger=IntervalTrigger(minutes=15),
        id="medication_reminder",
        name="Medication Dose Reminder Check",
        replace_existing=True,
        max_instances=1,             # prevent overlap if job is slow
    )

    _scheduler.start()
    logger.info(" Medication reminder scheduler started (every 15 minutes).")


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler (called on app shutdown)."""
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info(" Scheduler stopped.")


# ─── Push Notification Helper ─────────────────────────────────────────────────

def _send_push_to_user(user_id: str, med_name: str, slot: str, is_voice_reminder: bool = False) -> None:
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

        if is_voice_reminder:
            title = f"⚠️ URGENT: Missed {med_name}!"
            body = f"You are 30+ minutes late for your {slot} {med_name}. Please take it now."
            msg_type = "voice_reminder"
        else:
            slot_emoji = {"morning": "🌅", "afternoon": "☀️", "night": "🌙"}.get(slot, "⏰")
            title = f"{slot_emoji} Medication Reminder"
            body = f"Time to take your {med_name} ({slot}). Don't forget!"
            msg_type = "medication_reminder"

        from routers.voice import send_push_sync
        send_push_sync(
            token=user["expo_push_token"],
            title=title,
            body=body,
            data={"med_name": med_name, "slot": slot, "type": msg_type},
        )
    except Exception as e:
        logger.warning(f" Could not send push for user {str(user_id)[:8]}: {e}")

