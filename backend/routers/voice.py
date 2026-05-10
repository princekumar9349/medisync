"""
routers/voice.py — Voice reminders & push notifications for Medisync.

Routes:
  POST /voice-reminder   — Generate TTS audio reminder (gTTS)
  POST /notify           — Send Expo push notification to a device
  POST /notify-user      — Send push notification to a user by user_id (internal use)
"""

import io
import base64
import logging
import httpx

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from db import database
from models.schemas import TokenData
from services.auth_service import get_current_user

logger = logging.getLogger("Medisync.Voice")
router = APIRouter(tags=["Voice & Notifications"])

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


# ─── Schemas ──────────────────────────────────────────────────────────────────

class VoiceReminderRequest(BaseModel):
    medicine_name: str
    slot: str = "morning"           # morning / afternoon / night
    language: str = "en"           # en / hi


class PushNotificationRequest(BaseModel):
    expo_push_token: str
    title: str
    body: str
    data: dict = {}


class NotifyUserRequest(BaseModel):
    user_id: str
    title: str
    body: str
    data: dict = {}


# ─── Voice Reminder (gTTS TTS) ────────────────────────────────────────────────

@router.post(
    "/voice-reminder",
    summary="Generate a spoken medication reminder using gTTS",
)
async def voice_reminder(
    payload: VoiceReminderRequest,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Generates a text-to-speech audio reminder for the given medicine and time slot.
    Returns the audio as a base64-encoded MP3 string for playback in the mobile app.

    Supports English and Hindi reminders.
    """
    try:
        from gtts import gTTS

        slot_text = {
            "morning":   {"en": "in the morning",   "hi": "सुबह"},
            "afternoon": {"en": "in the afternoon",  "hi": "दोपहर में"},
            "night":     {"en": "at night",          "hi": "रात को"},
        }.get(payload.slot, {"en": "as scheduled", "hi": "निर्धारित समय पर"})

        lang = payload.language if payload.language in ("en", "hi") else "en"

        if lang == "hi":
            text = (
                f"दवाई का समय हो गया है। "
                f"कृपया {payload.medicine_name} "
                f"{slot_text['hi']} लें।"
            )
        else:
            text = (
                f"Medication reminder. "
                f"It's time to take your {payload.medicine_name} {slot_text['en']}. "
                f"Please take it now."
            )

        tts = gTTS(text=text, lang=lang, slow=False)
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)

        audio_b64 = base64.b64encode(audio_buffer.read()).decode("utf-8")

        logger.info(
            f"🔊 Voice reminder generated: {payload.medicine_name} "
            f"({payload.slot}, {lang}) for user {current_user.user_id[:8]}..."
        )

        return {
            "audio_base64": audio_b64,
            "format": "mp3",
            "text": text,
            "medicine": payload.medicine_name,
            "slot": payload.slot,
            "language": lang,
        }

    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="TTS service unavailable. Install gtts: pip install gtts",
        )
    except Exception as e:
        logger.error(f"❌ Voice reminder error: {e}")
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")


from models.schemas import VoiceReminderSchedule
from services.voice_provider import voice_client

@router.post(
    "/voice-reminder/schedule",
    summary="Trigger an automated voice call to the user's phone",
)
async def schedule_voice_call(
    payload: VoiceReminderSchedule,
    current_user: TokenData = Depends(get_current_user)
):
    """
    Initiates a phone call to the patient via Twilio (or Mock Provider).
    """
    msg = f"Hello, this is Medisync. Please remember to take your {payload.medicine_name} now."
    if payload.language == "hi":
        msg = f"नमस्ते, मेडिसिंक से। कृपया अपनी {payload.medicine_name} दवाई अभी लें।"

    success = voice_client.send_call(payload.phone_number, msg)
    if not success:
        raise HTTPException(status_code=500, detail="Voice call failed to dispatch.")

    return {"message": "Voice call dispatched successfully.", "status": "ringing"}


# ─── Push Notification (Expo) ─────────────────────────────────────────────────

@router.post(
    "/notify",
    summary="Send an Expo push notification to a specific device token",
)
async def notify_device(payload: PushNotificationRequest):
    """
    Send a push notification directly to an Expo push token.
    Uses the Expo Push API (no FCM/APNs credentials needed).

    The Expo push token looks like: ExponentPushToken[xxxxxxxxxxxxxxxxxxxx]
    """
    result = await _send_expo_push(
        token=payload.expo_push_token,
        title=payload.title,
        body=payload.body,
        data=payload.data,
    )
    return {"status": "sent", "expo_response": result}


@router.post(
    "/notify-user",
    summary="Send a push notification to a user by user_id",
)
async def notify_user_by_id(
    payload: NotifyUserRequest,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Looks up the user's stored Expo push token and sends them a notification.
    Only works if the user has registered their push token via POST /register-push-token.
    """
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    from bson import ObjectId
    try:
        user = users_col.find_one({"_id": ObjectId(payload.user_id)})
    except Exception:
        user = None

    if not user or not user.get("expo_push_token"):
        raise HTTPException(
            status_code=404,
            detail="User not found or push token not registered.",
        )

    result = await _send_expo_push(
        token=user["expo_push_token"],
        title=payload.title,
        body=payload.body,
        data=payload.data,
    )
    return {"status": "sent", "expo_response": result}


# ─── Shared Expo Push Helper ──────────────────────────────────────────────────

async def _send_expo_push(
    token: str,
    title: str,
    body: str,
    data: dict = {},
    sound: str = "default",
) -> dict:
    """
    Call the Expo push notification API.
    Returns the raw Expo API response dict.
    """
    message = {
        "to": token,
        "title": title,
        "body": body,
        "data": data,
        "sound": sound,
        "priority": "high",
        "channelId": "medication-reminders",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                EXPO_PUSH_URL,
                json={"messages": [message]},
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                },
            )
            resp.raise_for_status()
            result = resp.json()
            logger.info(f"📱 Expo push sent to {token[:20]}... — {result}")
            return result
    except httpx.HTTPError as e:
        logger.error(f"❌ Expo push failed: {e}")
        raise HTTPException(status_code=502, detail=f"Push notification failed: {str(e)}")


# ─── Internal helper (called by scheduler) ────────────────────────────────────

def send_push_sync(token: str, title: str, body: str, data: dict = {}) -> None:
    """
    Synchronous wrapper for push notifications — used by APScheduler background jobs.
    Uses httpx.Client (sync) since APScheduler doesn't run in an async context.
    """
    import httpx as _httpx
    message = {
        "to": token,
        "title": title,
        "body": body,
        "data": data,
        "sound": "default",
        "priority": "high",
        "channelId": "medication-reminders",
    }
    try:
        with _httpx.Client(timeout=10.0) as client:
            resp = client.post(
                EXPO_PUSH_URL,
                json={"messages": [message]},
                headers={"Accept": "application/json", "Content-Type": "application/json"},
            )
            logger.info(f"📱 Scheduler push sent to {token[:20]}... status={resp.status_code}")
    except Exception as e:
        logger.warning(f"⚠️ Scheduler push failed: {e}")
