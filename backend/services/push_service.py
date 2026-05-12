"""
services/push_service.py — Production Push Notification Service (Firebase Admin SDK v1 API)

Replaces the deprecated fcm_service.py (Legacy FCM Server Key architecture).
Uses firebase_admin.messaging which calls the FCM HTTP v1 API internally.

All public functions:
  - Gracefully skip if Firebase is not initialized
  - Remove stale tokens automatically (UnregisteredError / InvalidArgument)
  - Store notification record in MongoDB notifications collection
  - Return structured result dict

Public API:
    send_push_notification(user_id, title, body, data, channel, priority)
    send_multicast(tokens, title, body, data, android_config)
    doctor_message_push(patient_user_id, doctor_name, message_preview, thread_id)
    emergency_push(doctor_user_id, patient_name, emergency_id, note)
    caretaker_alert_push(caretaker_user_id, alert_type, patient_name, message)
    medicine_reminder_push(patient_user_id, medicine_name, medicine_id, slot, is_critical)
    adherence_warning_push(patient_user_id, title, body, warning_type)
"""

import logging
from datetime import datetime
from typing import Optional

from bson import ObjectId

from db import database
from services.firebase_service import is_firebase_ready

logger = logging.getLogger("Medisync.Push")

# ─── Token helpers ────────────────────────────────────────────────────────────

def _get_user_tokens(user_id: str) -> list[str]:
    """Fetch all FCM token strings registered for this user."""
    try:
        col = database.get_users()
        if col is None:
            return []
        user = col.find_one({"_id": ObjectId(user_id)}, {"fcm_tokens": 1})
        if not user:
            return []
        raw = user.get("fcm_tokens", [])
        # Support both string tokens and dict tokens {"token": "..."}
        tokens = []
        for t in raw:
            if isinstance(t, str):
                tokens.append(t)
            elif isinstance(t, dict) and t.get("token"):
                tokens.append(t["token"])
        return tokens
    except Exception as e:
        logger.warning(f"[Push] _get_user_tokens error: {e}")
        return []


def _remove_stale_token(user_id: str, token: str):
    """Remove a single stale token from the user document."""
    try:
        col = database.get_users()
        if col is None:
            return
        # Remove both plain-string tokens and dict tokens
        col.update_one(
            {"_id": ObjectId(user_id)},
            {
                "$pull": {
                    "fcm_tokens": {"$in": [token, {"token": token}]}
                }
            },
        )
        logger.info(f"[Push] 🗑️ Stale token removed for user {user_id[:8]}")
    except Exception as e:
        logger.warning(f"[Push] _remove_stale_token error: {e}")


# ─── Android channel config builder ──────────────────────────────────────────

def _android_config(channel_id: str, priority: str = "high") -> "messaging.AndroidConfig":
    from firebase_admin import messaging

    notif = messaging.AndroidNotification(
        channel_id=channel_id,
        sound="default",
        default_vibrate_timings=True,
    )

    # Emergency: max priority + full visibility
    if channel_id == "emergency":
        notif = messaging.AndroidNotification(
            channel_id="emergency",
            sound="default",
            default_vibrate_timings=True,
            visibility="public",
            notification_priority="PRIORITY_MAX",
        )

    return messaging.AndroidConfig(
        priority=priority,   # "high" or "normal"
        notification=notif,
    )


# ─── Core sender ──────────────────────────────────────────────────────────────

def send_multicast(
    tokens: list[str],
    title: str,
    body: str,
    data: dict[str, str],
    channel_id: str = "system",
    android_priority: str = "high",
    user_id: str = "",
) -> dict:
    """
    Send FCM v1 multicast to a list of tokens.
    Returns: {"success": int, "failure": int, "stale_removed": int}
    """
    if not is_firebase_ready():
        logger.warning("[Push] Firebase not ready — push skipped")
        return {"skipped": True, "reason": "firebase_not_initialized"}

    if not tokens:
        logger.debug("[Push] No tokens to push to")
        return {"skipped": True, "reason": "no_tokens"}

    from firebase_admin import messaging, exceptions as fb_exceptions

    # FCM v1 data values must all be strings
    str_data = {k: str(v) for k, v in (data or {}).items()}

    message = messaging.MulticastMessage(
        tokens=tokens,
        notification=messaging.Notification(title=title, body=body),
        data=str_data,
        android=_android_config(channel_id, android_priority),
    )

    results = {"success": 0, "failure": 0, "stale_removed": 0}
    try:
        batch_response = messaging.send_each_for_multicast(message)
        for idx, resp in enumerate(batch_response.responses):
            if resp.success:
                results["success"] += 1
            else:
                results["failure"] += 1
                err = resp.exception
                if err:
                    err_str = str(err)
                    logger.warning(f"[Push] Token[{idx}] failed: {err_str[:120]}")
                    # Stale token detection
                    if any(k in err_str for k in (
                        "registration-token-not-registered",
                        "invalid-registration-token",
                        "UnregisteredError",
                        "NOT_FOUND",
                    )):
                        if user_id and idx < len(tokens):
                            _remove_stale_token(user_id, tokens[idx])
                            results["stale_removed"] += 1
    except Exception as e:
        logger.error(f"[Push] send_each_for_multicast error: {e}")
        results["failure"] += len(tokens)

    logger.info(
        f"[Push] Multicast to {len(tokens)} token(s): "
        f"✅{results['success']} ❌{results['failure']} 🗑️{results['stale_removed']}"
    )
    return results


def send_push_notification(
    user_id: str,
    title: str,
    body: str,
    data: dict[str, str] = None,
    channel_id: str = "system",
    android_priority: str = "high",
) -> dict:
    """Send push to all devices registered to user_id."""
    tokens = _get_user_tokens(user_id)
    result = send_multicast(
        tokens=tokens,
        title=title,
        body=body,
        data=data or {},
        channel_id=channel_id,
        android_priority=android_priority,
        user_id=user_id,
    )
    return result


# ─── DB notification store ────────────────────────────────────────────────────

def _store_notification(
    user_id: str,
    notif_type: str,
    severity: str,
    title: str,
    body: str,
    action_route: str = "",
    metadata: dict = None,
) -> str:
    """Persist notification to MongoDB and return the inserted _id string."""
    try:
        col = database.get_notifications()
        if col is None:
            return ""
        doc = {
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
        }
        res = col.insert_one(doc)
        return str(res.inserted_id)
    except Exception as e:
        logger.warning(f"[Push] _store_notification error: {e}")
        return ""


# ─── Role-specific push senders ───────────────────────────────────────────────

def doctor_message_push(
    patient_user_id: str,
    doctor_name: str,
    message_preview: str,
    thread_id: str = "",
) -> dict:
    """Push notification to patient when doctor sends a message."""
    title = f"💬 Dr. {doctor_name}"
    body  = (message_preview or "New message from your doctor")[:120]
    data  = {
        "type": "doctor_message",
        "channel_id": "doctor-messages",
        "screen": "DoctorPatientChat",
        "doctor_name": doctor_name,
        "thread_id": thread_id,
        "patient_id": patient_user_id,
    }
    result = send_push_notification(
        user_id=patient_user_id,
        title=title,
        body=body,
        data=data,
        channel_id="doctor-messages",
        android_priority="high",
    )
    _store_notification(
        user_id=patient_user_id,
        notif_type="doctor_message",
        severity="medium",
        title=title,
        body=body,
        action_route="DoctorPatientChat",
        metadata={"doctor_name": doctor_name, "thread_id": thread_id},
    )
    return result


def emergency_push(
    doctor_user_id: str,
    patient_name: str,
    emergency_id: str,
    note: str = "",
) -> dict:
    """MAX-priority emergency alert to doctor."""
    title = f"🚨 EMERGENCY — {patient_name}"
    body  = note or f"{patient_name} triggered an SOS emergency alert"
    data  = {
        "type": "emergency",
        "channel_id": "emergency",
        "screen": "Emergency",
        "emergency_id": emergency_id,
        "patient_name": patient_name,
    }
    result = send_push_notification(
        user_id=doctor_user_id,
        title=title,
        body=body,
        data=data,
        channel_id="emergency",
        android_priority="high",
    )
    _store_notification(
        user_id=doctor_user_id,
        notif_type="emergency",
        severity="critical",
        title=title,
        body=body,
        action_route="Emergency",
        metadata={"emergency_id": emergency_id, "patient_name": patient_name},
    )
    return result


def caretaker_alert_push(
    caretaker_user_id: str,
    alert_type: str,     # "missed_medicine" | "inactivity" | "sos" | "adherence"
    patient_name: str,
    message: str,
) -> dict:
    """Push caretaker alert for missed meds, inactivity, or SOS."""
    ICONS = {"missed_medicine": "💊", "inactivity": "⚠️", "sos": "🚨", "adherence": "📊"}
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
    result = send_push_notification(
        user_id=caretaker_user_id,
        title=title,
        body=body,
        data=data,
        channel_id="caretaker",
        android_priority="high",
    )
    _store_notification(
        user_id=caretaker_user_id,
        notif_type="caretaker_alert",
        severity="high" if alert_type == "sos" else "medium",
        title=title,
        body=body,
        action_route="CaretakerDashboard",
        metadata={"alert_type": alert_type, "patient_name": patient_name},
    )
    return result


def medicine_reminder_push(
    patient_user_id: str,
    medicine_name: str,
    medicine_id: str,
    slot: str,           # morning | afternoon | night
    is_critical: bool = False,
) -> dict:
    """Push medicine reminder to patient."""
    title = f"💊 Time for {medicine_name}"
    body  = f"Your {slot} dose of {medicine_name} is due now"
    data  = {
        "type": "medicine_reminder",
        "channel_id": "med-reminder",
        "screen": "Pillbox",
        "medicineId": medicine_id,
        "medicine_name": medicine_name,
        "slot": slot,
        "is_critical": "true" if is_critical else "false",
    }
    result = send_push_notification(
        user_id=patient_user_id,
        title=title,
        body=body,
        data=data,
        channel_id="med-reminder",
        android_priority="high",
    )
    _store_notification(
        user_id=patient_user_id,
        notif_type="medicine_reminder",
        severity="high" if is_critical else "medium",
        title=title,
        body=body,
        action_route="Pillbox",
        metadata={"medicine_name": medicine_name, "slot": slot},
    )
    return result


def adherence_warning_push(
    patient_user_id: str,
    title: str,
    body: str,
    warning_type: str = "adherence_warning",
) -> dict:
    """Push AI-generated adherence or health warning to patient."""
    data = {
        "type": warning_type,
        "channel_id": "ai-warnings",
        "screen": "Alerts",
    }
    result = send_push_notification(
        user_id=patient_user_id,
        title=f"🤖 {title}",
        body=body,
        data=data,
        channel_id="ai-warnings",
        android_priority="normal",
    )
    _store_notification(
        user_id=patient_user_id,
        notif_type=warning_type,
        severity="medium",
        title=f"🤖 {title}",
        body=body,
        action_route="Alerts",
        metadata={},
    )
    return result
