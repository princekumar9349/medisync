"""
services/fcm_service.py — Role-Based FCM Push Notification Helpers

Provides typed push notification senders for each MediSync notification type.
All functions:
  - Fetch FCM tokens from MongoDB for the target user
  - Build correctly typed FCM payloads
  - Store notification in DB via push_notification_to_user()
  - Gracefully skip if FCM_SERVER_KEY is not configured

Usage (from other routers):
    from services.fcm_service import send_doctor_message_push, send_emergency_push

Payload types supported:
  - medicine_reminder
  - doctor_message
  - emergency
  - ai_warning
  - caretaker_alert
  - adherence_warning
"""

import logging
import os
from datetime import datetime

import httpx
from bson import ObjectId

from db import database

logger = logging.getLogger("Medisync.FCM")

FCM_LEGACY_URL = "https://fcm.googleapis.com/fcm/send"


# ─── Core FCM Sender ──────────────────────────────────────────────────────────

def _get_fcm_key() -> str:
    return os.getenv("FCM_SERVER_KEY", "")


def _get_user_tokens(user_id: str) -> list[str]:
    """Retrieve all active FCM tokens for a user from MongoDB."""
    try:
        users_col = database.get_users()
        if users_col is None:
            return []
        user = users_col.find_one({"_id": ObjectId(user_id)}, {"fcm_tokens": 1})
        return user.get("fcm_tokens", []) if user else []
    except Exception as e:
        logger.warning(f"[FCM] get_user_tokens error: {e}")
        return []


def _remove_stale_token(user_id: str, token: str):
    """Remove a stale/invalid token from user's token list."""
    try:
        users_col = database.get_users()
        if users_col:
            users_col.update_one(
                {"_id": ObjectId(user_id)},
                {"$pull": {"fcm_tokens": token}},
            )
            logger.info(f"[FCM] Stale token removed for user {user_id[:8]}")
    except Exception:
        pass


def send_fcm_to_tokens(
    tokens: list[str],
    title: str,
    body: str,
    data: dict,
    priority: str = "high",
    user_id: str = "",
) -> dict:
    """
    Send FCM push to a list of tokens via Legacy HTTP API.
    Cleans up stale tokens (404 responses).
    """
    key = _get_fcm_key()
    if not key:
        logger.warning("[FCM] FCM_SERVER_KEY not set — push skipped")
        return {"skipped": True, "reason": "no_key"}

    if not tokens:
        return {"skipped": True, "reason": "no_tokens"}

    results = {"success": 0, "failure": 0, "stale_removed": 0}

    for token in tokens:
        try:
            payload = {
                "to": token,
                "notification": {"title": title, "body": body},
                "data": {**data, "click_action": "FLUTTER_NOTIFICATION_CLICK"},
                "priority": priority,
                "android": {
                    "priority": "high",
                    "notification": {
                        "channel_id": data.get("channel_id", "system"),
                        "sound": "default",
                        "default_vibrate_timings": True,
                    },
                },
            }

            # Emergency: max priority + full visibility
            if data.get("type") == "emergency":
                payload["android"]["notification"].update({
                    "channel_id": "emergency",
                    "visibility": "PUBLIC",
                    "notification_priority": "PRIORITY_MAX",
                    "default_vibrate_timings": True,
                })

            resp = httpx.post(
                FCM_LEGACY_URL,
                headers={
                    "Authorization": f"key={key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=6.0,
            )

            resp_json = resp.json()
            if resp.status_code == 200 and resp_json.get("success", 0) == 1:
                results["success"] += 1
            else:
                # Check for invalid token
                errors = resp_json.get("results", [{}])
                if errors and errors[0].get("error") in ("NotRegistered", "InvalidRegistration"):
                    if user_id:
                        _remove_stale_token(user_id, token)
                        results["stale_removed"] += 1
                results["failure"] += 1
                logger.warning(f"[FCM] Push failed: {resp_json.get('results', resp.text[:100])}")

        except Exception as e:
            results["failure"] += 1
            logger.error(f"[FCM] HTTP error sending to token: {e}")

    logger.info(
        f"[FCM] Sent to {len(tokens)} token(s): "
        f"✅{results['success']} ❌{results['failure']} 🗑️{results['stale_removed']}"
    )
    return results


# ─── Role-Specific Push Senders ───────────────────────────────────────────────

def send_doctor_message_push(
    patient_user_id: str,
    doctor_name: str,
    message_preview: str,
    thread_id: str = "",
) -> dict:
    """
    Push notification to patient when doctor sends a message.
    Deep-links to DoctorPatientChat screen.
    """
    tokens = _get_user_tokens(patient_user_id)
    title = f"💬 Dr. {doctor_name}"
    body  = message_preview[:100] if message_preview else "New message from your doctor"
    data  = {
        "type": "doctor_message",
        "channel_id": "doctor-messages",
        "screen": "DoctorPatientChat",
        "doctor_name": doctor_name,
        "thread_id": thread_id,
        "patient_id": patient_user_id,
    }
    result = send_fcm_to_tokens(tokens, title, body, data, user_id=patient_user_id)
    _store_notification_db(
        user_id=patient_user_id,
        notif_type="doctor_message",
        severity="medium",
        title=title,
        body=body,
        action_route="DoctorPatientChat",
        metadata={"doctor_name": doctor_name, "thread_id": thread_id},
    )
    return result


def send_emergency_push(
    doctor_user_id: str,
    patient_name: str,
    emergency_id: str,
    note: str = "",
) -> dict:
    """
    Push MAX-priority emergency alert to doctor.
    Deep-links to Emergency screen.
    """
    tokens = _get_user_tokens(doctor_user_id)
    title  = f"🚨 EMERGENCY — {patient_name}"
    body   = note or f"{patient_name} triggered an SOS emergency alert"
    data   = {
        "type": "emergency",
        "channel_id": "emergency",
        "screen": "Emergency",
        "emergency_id": emergency_id,
        "patient_name": patient_name,
    }
    result = send_fcm_to_tokens(tokens, title, body, data, priority="high", user_id=doctor_user_id)
    _store_notification_db(
        user_id=doctor_user_id,
        notif_type="emergency",
        severity="critical",
        title=title,
        body=body,
        action_route="Emergency",
        metadata={"emergency_id": emergency_id, "patient_name": patient_name},
    )
    return result


def send_caretaker_alert_push(
    caretaker_user_id: str,
    alert_type: str,          # "missed_medicine" | "inactivity" | "sos" | "adherence"
    patient_name: str,
    message: str,
) -> dict:
    """Push caretaker alert for missed meds, inactivity, or emergency."""
    tokens = _get_user_tokens(caretaker_user_id)

    ICONS = {
        "missed_medicine": "💊",
        "inactivity": "⚠️",
        "sos": "🚨",
        "adherence": "📊",
    }
    icon  = ICONS.get(alert_type, "🔔")
    title = f"{icon} Caretaker Alert — {patient_name}"
    body  = message[:120]
    data  = {
        "type": "caretaker_alert",
        "channel_id": "caretaker",
        "screen": "CaretakerDashboard",
        "alert_type": alert_type,
        "patient_name": patient_name,
    }
    result = send_fcm_to_tokens(tokens, title, body, data, user_id=caretaker_user_id)
    _store_notification_db(
        user_id=caretaker_user_id,
        notif_type="caretaker_alert",
        severity="high" if alert_type == "sos" else "medium",
        title=title,
        body=body,
        action_route="CaretakerDashboard",
        metadata={"alert_type": alert_type, "patient_name": patient_name},
    )
    return result


def send_medicine_reminder_push(
    patient_user_id: str,
    medicine_name: str,
    medicine_id: str,
    slot: str,          # morning | afternoon | night
    is_critical: bool = False,
) -> dict:
    """Push medicine reminder to patient."""
    tokens = _get_user_tokens(patient_user_id)
    title  = f"💊 Time for {medicine_name}"
    body   = f"Your {slot} dose of {medicine_name} is due now"
    data   = {
        "type": "medicine_reminder",
        "channel_id": "med-reminder",
        "screen": "Pillbox",
        "medicineId": medicine_id,
        "medicine_name": medicine_name,
        "slot": slot,
        "is_critical": str(is_critical).lower(),
    }
    result = send_fcm_to_tokens(tokens, title, body, data, user_id=patient_user_id)
    _store_notification_db(
        user_id=patient_user_id,
        notif_type="medicine_reminder",
        severity="high" if is_critical else "medium",
        title=title,
        body=body,
        action_route="Pillbox",
        metadata={"medicine_name": medicine_name, "slot": slot},
    )
    return result


def send_ai_warning_push(
    patient_user_id: str,
    title: str,
    body: str,
    warning_type: str = "adherence_warning",
) -> dict:
    """Push AI-generated health warning to patient."""
    tokens = _get_user_tokens(patient_user_id)
    data   = {
        "type": warning_type,
        "channel_id": "ai-warnings",
        "screen": "Alerts",
    }
    result = send_fcm_to_tokens(tokens, f"🤖 {title}", body, data, user_id=patient_user_id)
    _store_notification_db(
        user_id=patient_user_id,
        notif_type=warning_type,
        severity="medium",
        title=f"🤖 {title}",
        body=body,
        action_route="Alerts",
        metadata={},
    )
    return result


# ─── DB Helper ────────────────────────────────────────────────────────────────

def _store_notification_db(
    user_id: str,
    notif_type: str,
    severity: str,
    title: str,
    body: str,
    action_route: str = "",
    metadata: dict = None,
):
    """Store notification record in MongoDB notifications collection."""
    try:
        notifs_col = database.get_notifications()
        if notifs_col is None:
            return
        notifs_col.insert_one({
            "user_id": user_id,
            "type": notif_type,
            "severity": severity,
            "title": title,
            "body": body,
            "read": False,
            "created_at": datetime.utcnow(),
            "action_route": action_route,
            "metadata": metadata or {},
            "analytics": {
                "delivered": True,
                "opened": False,
                "dismissed": False,
                "action_taken": False,
                "escalation_triggered": False,
            },
        })
    except Exception as e:
        logger.warning(f"[FCM] DB store failed: {e}")
