import logging
import os
from datetime import datetime, timedelta
from db import database

from core.constants.escalation_levels import EscalationLevel, EscalationStatus
from escalation.history import EscalationHistory
from routers.notifications import _send_fcm_push
from routers.voice import send_push_sync

logger = logging.getLogger("Medisync.EscalationEngine")


def _trigger_dtmf_reminder_call(user_id: str, phone_number: str, med_id: str, medicine_name: str, slot: str, is_critical: bool) -> None:
    """
    Fires an outbound DTMF reminder call via the voice_ai module.
    Patient presses 1 (taken) or 2 (not taken) — dose is logged automatically.
    """
    try:
        from voice_ai.handlers.adherence_updater import process_voice_adherence
        from services.voice_provider import voice_client, TwilioVoiceProvider
        import urllib.parse

        if not isinstance(voice_client, TwilioVoiceProvider) or not voice_client.client:
            logger.warning("Twilio not configured — skipping DTMF escalation call.")
            return

        base_url = os.getenv("PUBLIC_API_URL", "")
        if not base_url:
            logger.error("PUBLIC_API_URL not set — cannot build Twilio webhook URL for DTMF call.")
            return

        webhook_url = (
            f"{base_url}/voice-ai/webhook"
            f"?user_id={user_id}"
            f"&med_id={med_id}"
            f"&medicine_name={urllib.parse.quote(medicine_name)}"
            f"&slot={urllib.parse.quote(slot)}"
            f"&is_critical={str(is_critical).lower()}"
        )

        call = voice_client.client.calls.create(
            url=webhook_url,
            to=phone_number,
            from_=voice_client.from_number,
            method="POST"
        )
        logger.info(f"📞 DTMF escalation call initiated: SID={call.sid} → {phone_number} for {medicine_name}")
    except Exception as e:
        logger.error(f"DTMF escalation call failed: {e}")

def evaluate_dose(user_id: str, med_name: str, slot: str, med_id: str, slot_time: datetime, now: datetime, is_critical: bool, caregiver_phone: str, expo_push_token: str, fcm_tokens: list, patient_phone: str = "", **kwargs):
    """
    Core escalation rules engine.
    Ensures idempotency. Checks if taken. Determines level. Logs history. Triggers push/alert.
    """
    delay_minutes = (now - slot_time).total_seconds() / 60.0

    # 1. Check if already marked taken or skipped today
    dose_logs_col = database.get_dose_logs()
    if dose_logs_col is None:
        return

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    already_handled = dose_logs_col.find_one({
        "user_id": user_id,
        "medicine_name": med_name,
        "status": {"$in": ["taken", "skipped"]},
        "timestamp": {"$gte": today_start},
        "note": slot,
    })
    
    if already_handled:
        return

    # 2. Determine escalation level
    level = None
    if -16 <= delay_minutes < -14:
        level = EscalationLevel.SAFE
    elif -6 <= delay_minutes < -4:
        level = EscalationLevel.DUE_SOON
    elif 0 <= delay_minutes < 2:
        level = EscalationLevel.CRITICAL
    elif 10 <= delay_minutes < 12:
        level = EscalationLevel.MISSED
    elif 15 <= delay_minutes < 17:
        if is_critical:
            level = EscalationLevel.ESCALATED_HIGH # Skip soft for critical
        else:
            level = EscalationLevel.ESCALATED_SOFT
    elif 30 <= delay_minutes < 32:
        level = EscalationLevel.ESCALATED_HIGH

    if not level:
        return

    # 3. Idempotency Check
    if EscalationHistory.check_already_triggered(user_id, med_name, slot, level, today_start):
        return

    # 4. Mark Missed explicitly in dose_logs if it's T+10
    if level == EscalationLevel.MISSED:
        dose_logs_col.insert_one({
            "user_id": user_id,
            "med_id": med_id,
            "medicine_name": med_name,
            "status": "missed",
            "timestamp": now,
            "note": slot,
            "delay_minutes": int(delay_minutes)
        })

    # 5. Log Escalation History
    history_id = EscalationHistory.log_escalation(user_id, med_id, med_name, slot, level, now)
    logger.info(f"Escalation [{level}] for {med_name} ({slot}) user {str(user_id)[:8]}")

    # 6. Execute Notification Action
    success = _execute_notification(
        level=level,
        user_id=user_id,
        med_name=med_name,
        slot=slot,
        med_id=med_id,
        expo_push_token=expo_push_token,
        fcm_tokens=fcm_tokens,
        caregiver_phone=caregiver_phone,
        patient_phone=kwargs.get("patient_phone", ""),
        is_critical=is_critical
    )
    if success:
        EscalationHistory.update_delivery_status(history_id, EscalationStatus.DELIVERED)

def _execute_notification(level: str, user_id: str, med_name: str, slot: str, med_id: str, expo_push_token: str, fcm_tokens: list, caregiver_phone: str, patient_phone: str = "", is_critical: bool = False) -> bool:
    from core.constants.notification_types import NotificationType
    
    title = ""
    body = ""
    msg_type = NotificationType.MEDICINE_REMINDER

    if level == EscalationLevel.SAFE:
        title = f"💊 Upcoming: {med_name}"
        body = f"Your {slot} dose is due in 15 minutes."
    elif level == EscalationLevel.DUE_SOON:
        title = f"⏰ Due Soon: {med_name}"
        body = f"Please prepare to take your {slot} dose in 5 mins."
    elif level == EscalationLevel.CRITICAL:
        title = f"❗ Due Now: {med_name}"
        body = f"It's time for your {slot} {med_name}!"
    elif level == EscalationLevel.MISSED:
        title = f"⚠️ Missed Dose: {med_name}"
        body = f"You are 10 minutes late for {med_name}. Please log it."
    elif level == EscalationLevel.ESCALATED_SOFT:
        title = f"Caretaker Alert: Missed Dose"
        body = f"Patient is 15 minutes late for {med_name}."
        msg_type = NotificationType.CAREGIVER_ALERT
    elif level == EscalationLevel.ESCALATED_HIGH:
        title = f"🚨 URGENT Caretaker Alert"
        body = f"Patient is 30+ minutes late for {med_name}. Please intervene."
        msg_type = NotificationType.CAREGIVER_ALERT
        # Fire a DTMF reminder call to the patient so they can confirm via keypress
        if patient_phone:
            _trigger_dtmf_reminder_call(
                user_id=user_id,
                phone_number=patient_phone,
                med_id=med_id,
                medicine_name=med_name,
                slot=slot,
                is_critical=is_critical
            )
        elif caregiver_phone:
            logger.info(f"No patient phone — skipping DTMF call. Caregiver notified via push.")

    data_payload = {
        "type": msg_type,
        "medicineId": med_id,
        "med_name": med_name,
        "slot": slot,
        "escalation": level
    }

    try:
        if msg_type == NotificationType.CAREGIVER_ALERT:
            # For caregiver alerts, we need to push to caregiver's FCM tokens, not the patient's!
            # Since the current architecture binds FCM tokens to user_id, we need to query caregiver users linked to this patient.
            # For MVP, we might broadcast to the caregiver's phone if known, or send push to caretaker topic.
            # Let's push to the patient's device for now (or a known caretaker login on the same device)
            # Actually, caretaker login saves fcm_tokens on the caretaker's User document.
            users_col = database.get_users()
            caretakers = list(users_col.find({"role": "caretaker", "linked_patient_id": user_id}))
            caretaker_tokens = []
            for c in caretakers:
                caretaker_tokens.extend([t["token"] for t in c.get("fcm_tokens", []) if "token" in t])
            
            if caretaker_tokens:
                _send_fcm_push(caretaker_tokens, title, body, data=data_payload)
            else:
                logger.warning(f"No caretaker FCM tokens found for patient {user_id}")
        else:
            # Patient push
            if fcm_tokens:
                _send_fcm_push(fcm_tokens, title, body, data=data_payload)
            if expo_push_token:
                send_push_sync(token=expo_push_token, title=title, body=body, data=data_payload)
        return True
    except Exception as e:
        logger.error(f"Push error: {e}")
        return False
