"""
routers/notifications.py — Notification Inbox, FCM Token Registry & Push Service

Endpoints:
  POST /notifications/fcm-token        — Register/update device FCM token
  GET  /notifications                  — Fetch user notification inbox
  GET  /notifications/unread-count     — Badge count
  POST /notifications/mark-read        — Mark notification IDs as read
  POST /notifications/send             — Store + optionally push a notification (internal/admin)
  GET  /notifications/preferences      — Get user notification preferences
  PUT  /notifications/preferences      — Update notification preferences
"""

import logging
import os
from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from db import database
from models.schemas import TokenData
from services.auth_service import get_current_user

logger = logging.getLogger("Medisync.Notifications")
router = APIRouter(prefix="/notifications", tags=["Notifications"])

# ─── FCM Push Helper ──────────────────────────────────────────────────────────

def _send_fcm_push(tokens: list[str], title: str, body: str, data: dict = None) -> dict:
    """
    Send FCM push via HTTP v1 API.
    Uses the server key from environment.
    Gracefully fails if FCM is not configured.
    """
    FCM_SERVER_KEY = os.getenv("FCM_SERVER_KEY", "")
    if not FCM_SERVER_KEY or not tokens:
        logger.warning("FCM_SERVER_KEY not set or no tokens — push skipped")
        return {"skipped": True}

    import httpx
    results = {"success": 0, "failure": 0, "errors": []}
    for token in tokens:
        try:
            resp = httpx.post(
                "https://fcm.googleapis.com/fcm/send",
                headers={
                    "Authorization": f"key={FCM_SERVER_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "to": token,
                    "notification": {"title": title, "body": body},
                    "data": data or {},
                    "priority": "high",
                    "android": {"priority": "high"},
                    "apns": {"headers": {"apns-priority": "10"}},
                },
                timeout=5.0,
            )
            if resp.status_code == 200 and resp.json().get("success", 0) == 1:
                results["success"] += 1
            else:
                results["failure"] += 1
                results["errors"].append(resp.text[:200])
        except Exception as e:
            results["failure"] += 1
            results["errors"].append(str(e))
    return results


def _get_user_fcm_tokens(user_id: str) -> list[str]:
    """Retrieve all FCM tokens for a user."""
    users_col = database.get_users()
    if users_col is None:
        return []
    user = users_col.find_one({"_id": ObjectId(user_id)}, {"fcm_tokens": 1})
    return user.get("fcm_tokens", []) if user else []


# ─── Public push helper (called by other routers) ────────────────────────────

def push_notification_to_user(
    user_id: str,
    notif_type: str,
    severity: str,
    title: str,
    body: str,
    action_route: str = "",
    metadata: dict = None,
    push: bool = True,
) -> str:
    """
    Store a notification in DB and optionally push via Firebase Admin SDK (FCM v1).
    Returns the inserted notification _id as string.
    Called by doctor.py, tracking.py, etc.
    """
    notifs_col = database.get_notifications()
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
            "delivered": False,
            "opened": False,
            "dismissed": False,
            "action_taken": False,
            "escalation_triggered": False,
        },
    }
    inserted_id = ""
    if notifs_col is not None:
        res = notifs_col.insert_one(doc)
        inserted_id = str(res.inserted_id)
        notifs_col.update_one({"_id": res.inserted_id}, {"$set": {"analytics.delivered": True}})

    if push:
        try:
            from services.push_service import send_push_notification
            send_push_notification(
                user_id=user_id,
                title=title,
                body=body,
                data={
                    "type": notif_type,
                    "action_route": action_route,
                    "notification_id": inserted_id,
                    "severity": severity,
                },
                channel_id=_notif_type_to_channel(notif_type),
            )
        except Exception as e:
            logger.warning(f"[Notifications] FCM push failed (non-fatal): {e}")

    logger.info(f"📬 Notification [{severity}] → user {user_id[:8]}: {title}")
    return inserted_id


def _notif_type_to_channel(notif_type: str) -> str:
    """Map notification type to Notifee channel ID."""
    return {
        "emergency":        "emergency",
        "doctor_message":   "doctor-messages",
        "medicine_reminder":"med-reminder",
        "ai_warning":       "ai-warnings",
        "adherence_warning":"ai-warnings",
        "caretaker_alert":  "caretaker",
    }.get(notif_type, "system")


# ─── Models ───────────────────────────────────────────────────────────────────

class FCMTokenPayload(BaseModel):
    token: str
    device_id: Optional[str] = ""
    platform: Optional[str] = "android"

class MarkReadPayload(BaseModel):
    ids: List[str]
    mark_all: bool = False

class SendNotificationPayload(BaseModel):
    user_id: str
    type: str = "system"
    severity: str = "low"          # low | medium | high | critical
    title: str
    body: str
    action_route: str = ""
    metadata: dict = {}
    push: bool = True

class NotificationPreferences(BaseModel):
    medicine_reminders: bool = True
    doctor_messages: bool = True
    caretaker_alerts: bool = True
    ai_warnings: bool = True
    daily_summary: bool = True
    emergency_alerts: bool = True   # always bypasses silent
    silent_hours_start: Optional[str] = "22:00"
    silent_hours_end: Optional[str] = "07:00"
    vibration: bool = True
    critical_only_mode: bool = False
    reminder_frequency_minutes: int = 10
    patient_summary_time: str = "21:00"
    doctor_summary_time: str = "20:00"
    caretaker_summary_time: str = "21:30"


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/fcm-token", summary="Register or update device FCM token")
def register_fcm_token(payload: FCMTokenPayload, current_user: TokenData = Depends(get_current_user)):
    """
    Upsert device FCM token for the authenticated user.
    - If this token is new: add to fcm_tokens array
    - If token already exists: update its timestamp
    - device_info sub-document tracks per-device metadata
    """
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    now = datetime.utcnow()
    device_key = payload.device_id or "default"

    # Remove any old entry for this token, then push fresh entry
    users_col.update_one(
        {"_id": ObjectId(current_user.user_id)},
        {"$pull": {"fcm_tokens": {"token": payload.token}}},
    )
    users_col.update_one(
        {"_id": ObjectId(current_user.user_id)},
        {
            "$push": {
                "fcm_tokens": {
                    "token": payload.token,
                    "platform": payload.platform or "android",
                    "device_id": device_key,
                    "updated_at": now,
                }
            },
            "$set": {
                f"device_info.{device_key}": {
                    "token": payload.token,
                    "platform": payload.platform or "android",
                    "updated_at": now,
                }
            },
        },
    )
    logger.info(f"📱 FCM token registered for user {current_user.user_id[:8]} device={device_key}")
    return {"registered": True}


@router.get("/unread-count", summary="Unread notification badge count")
def get_unread_count(current_user: TokenData = Depends(get_current_user)):
    notifs_col = database.get_notifications()
    if notifs_col is None:
        return {"unread": 0}
    count = notifs_col.count_documents({"user_id": current_user.user_id, "read": False})
    by_type = {}
    for t in ["medicine", "doctor_message", "emergency", "ai_warning", "caretaker", "system"]:
        by_type[t] = notifs_col.count_documents({"user_id": current_user.user_id, "read": False, "type": t})
    return {"unread": count, "by_type": by_type}


@router.get("", summary="Fetch notification inbox")
def get_notifications(
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    notif_type: Optional[str] = Query(None, description="Filter by type"),
    unread_only: bool = Query(False),
    current_user: TokenData = Depends(get_current_user),
):
    notifs_col = database.get_notifications()
    if notifs_col is None:
        return {"notifications": [], "total": 0, "unread": 0}
    filt: dict = {"user_id": current_user.user_id}
    if notif_type:
        filt["type"] = notif_type
    if unread_only:
        filt["read"] = False
    total = notifs_col.count_documents(filt)
    unread = notifs_col.count_documents({**filt, "read": False})
    docs = list(notifs_col.find(filt).sort("created_at", -1).skip(skip).limit(limit))
    items = []
    for d in docs:
        items.append({
            "id": str(d["_id"]),
            "type": d.get("type", "system"),
            "severity": d.get("severity", "low"),
            "title": d.get("title", ""),
            "body": d.get("body", ""),
            "read": d.get("read", False),
            "created_at": d.get("created_at", datetime.utcnow()).isoformat(),
            "action_route": d.get("action_route", ""),
            "metadata": d.get("metadata", {}),
        })
    return {"notifications": items, "total": total, "unread": unread}


@router.post("/mark-read", summary="Mark notifications as read")
def mark_notifications_read(payload: MarkReadPayload, current_user: TokenData = Depends(get_current_user)):
    notifs_col = database.get_notifications()
    if notifs_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    if payload.mark_all:
        res = notifs_col.update_many(
            {"user_id": current_user.user_id, "read": False},
            {"$set": {"read": True, "analytics.opened": True}},
        )
    else:
        ids = [ObjectId(i) for i in payload.ids if i]
        res = notifs_col.update_many(
            {"_id": {"$in": ids}, "user_id": current_user.user_id},
            {"$set": {"read": True, "analytics.opened": True}},
        )
    return {"marked_read": res.modified_count}


@router.post("/send", summary="Send a notification to a user (internal/admin)")
def send_notification(payload: SendNotificationPayload, current_user: TokenData = Depends(get_current_user)):
    """Admin/doctor use: store + optionally FCM-push a notification."""
    nid = push_notification_to_user(
        user_id=payload.user_id,
        notif_type=payload.type,
        severity=payload.severity,
        title=payload.title,
        body=payload.body,
        action_route=payload.action_route,
        metadata=payload.metadata,
        push=payload.push,
    )
    return {"sent": True, "notification_id": nid}


@router.get("/preferences", summary="Get notification preferences")
def get_preferences(current_user: TokenData = Depends(get_current_user)):
    users_col = database.get_users()
    if users_col is None:
        return NotificationPreferences().model_dump()
    user = users_col.find_one({"_id": ObjectId(current_user.user_id)}, {"notification_prefs": 1})
    prefs = user.get("notification_prefs", {}) if user else {}
    defaults = NotificationPreferences().model_dump()
    defaults.update(prefs)
    return defaults


@router.put("/preferences", summary="Update notification preferences")
def update_preferences(prefs: NotificationPreferences, current_user: TokenData = Depends(get_current_user)):
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    users_col.update_one(
        {"_id": ObjectId(current_user.user_id)},
        {"$set": {"notification_prefs": prefs.model_dump()}},
    )
    return {"updated": True}


@router.post("/analytics/{notification_id}", summary="Record notification analytics event")
def record_analytics(
    notification_id: str,
    event: str = Query(..., description="opened|dismissed|action_taken|escalation_triggered"),
    current_user: TokenData = Depends(get_current_user),
):
    notifs_col = database.get_notifications()
    if notifs_col is None:
        return {"ok": True}
    valid = {"opened", "dismissed", "action_taken", "escalation_triggered"}
    if event not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid event. Must be one of: {valid}")
    try:
        notifs_col.update_one(
            {"_id": ObjectId(notification_id), "user_id": current_user.user_id},
            {"$set": {f"analytics.{event}": True}},
        )
    except Exception:
        pass
    return {"recorded": True}


@router.post("/test-push", summary="Send a test FCM push to yourself (diagnostic)")
def send_test_push(current_user: TokenData = Depends(get_current_user)):
    """
    Sends a real FCM push notification to ALL devices registered for the calling user.
    Used by the Notification Diagnostics screen to test the full backend → FCM → device pipeline.
    """
    try:
        from services.push_service import send_push_notification
        result = send_push_notification(
            user_id=current_user.user_id,
            title="✅ MediSync Push Test",
            body="Full pipeline test successful! Server → FCM → Device is working.",
            data={
                "type": "system",
                "action_route": "NotificationDebug",
                "test": "true",
            },
            channel_id="system",
            android_priority="high",
        )
        # Also persist in inbox
        push_notification_to_user(
            user_id=current_user.user_id,
            notif_type="system",
            severity="low",
            title="✅ Notification Test",
            body="Your notification pipeline is working correctly.",
            action_route="NotificationDebug",
            push=False,  # Already sent above
        )
        logger.info(f"[TestPush] Sent to user {current_user.user_id[:8]} → result: {result}")
        return {"message": "✅ Test push sent! It should arrive in a few seconds.", "result": result}
    except Exception as e:
        logger.error(f"[TestPush] Failed for user {current_user.user_id[:8]}: {e}")
        raise HTTPException(status_code=500, detail=f"Push failed: {str(e)}")
