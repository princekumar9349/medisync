"""
voice_ai/twilio_routes.py — DTMF-based Medicine Reminder Call System

Call Flow:
  1. /voice-ai/initiate   → Trigger an outbound call via Twilio
  2. /voice-ai/webhook    → Called when patient answers; plays reminder + Gather (Press 1 or 2)
  3. /voice-ai/gather-response → Twilio POSTs the digit pressed here; logs dose & plays thank-you
"""

import logging
import urllib.parse
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from twilio.twiml.voice_response import VoiceResponse, Gather
from pydantic import BaseModel

from voice_ai.handlers.adherence_updater import process_voice_adherence
from services.voice_provider import voice_client, TwilioVoiceProvider
import os

logger = logging.getLogger("Medisync.VoiceAI.Routes")
router = APIRouter(tags=["Voice AI Webhooks"])


# ── Request Model ──────────────────────────────────────────────────────────────

class InitiateCallRequest(BaseModel):
    user_id: str
    phone_number: str
    med_id: str
    medicine_name: str
    slot: str
    is_critical: bool = False


# ── 1. Initiate Outbound Call ──────────────────────────────────────────────────

@router.post("/initiate", summary="Initiate a DTMF Medicine Reminder Call")
async def initiate_call(payload: InitiateCallRequest, request: Request):
    """
    Triggers an outgoing Twilio call to the patient.
    On answer, Twilio hits /voice-ai/webhook which plays the reminder
    and prompts the patient to press 1 (taken) or 2 (not taken).
    """
    base_url = os.getenv("PUBLIC_API_URL", str(request.base_url).rstrip("/"))

    # Build the webhook URL with all context embedded as query params
    webhook_url = (
        f"{base_url}/voice-ai/webhook"
        f"?user_id={payload.user_id}"
        f"&med_id={payload.med_id}"
        f"&medicine_name={urllib.parse.quote(payload.medicine_name)}"
        f"&slot={urllib.parse.quote(payload.slot)}"
        f"&is_critical={str(payload.is_critical).lower()}"
    )

    if isinstance(voice_client, TwilioVoiceProvider) and voice_client.client:
        try:
            call = voice_client.client.calls.create(
                url=webhook_url,
                to=payload.phone_number,
                from_=voice_client.from_number,
                method="POST"
            )
            logger.info(f"📞 DTMF Reminder Call initiated: SID={call.sid} → {payload.phone_number}")
            return {"status": "initiated", "call_sid": call.sid}
        except Exception as e:
            logger.error(f"Failed to initiate Twilio call: {e}")
            raise HTTPException(status_code=500, detail="Failed to initiate voice call")
    else:
        # Sandbox / Mock mode — log and return the simulated webhook URL
        logger.info(f"[MOCK] DTMF call simulated to {payload.phone_number}. Webhook: {webhook_url}")
        return {"status": "simulated", "webhook_url": webhook_url}


# ── 2. Webhook: Patient Answers the Call ──────────────────────────────────────

@router.post("/webhook", response_class=HTMLResponse, summary="Twilio webhook: call connected")
async def voice_webhook(
    request: Request,
    user_id: str,
    med_id: str,
    medicine_name: str,
    slot: str,
    is_critical: str = "false"
):
    """
    Twilio hits this when the patient picks up.
    Plays a bilingual reminder and waits for DTMF input (Press 1 or 2).
    """
    base_url = os.getenv("PUBLIC_API_URL", str(request.base_url).rstrip("/"))

    gather_action = (
        f"{base_url}/voice-ai/gather-response"
        f"?user_id={user_id}"
        f"&med_id={med_id}"
        f"&medicine_name={urllib.parse.quote(medicine_name)}"
        f"&slot={urllib.parse.quote(slot)}"
        f"&is_critical={is_critical}"
    )

    response = VoiceResponse()

    gather = Gather(
        input="dtmf",
        num_digits=1,
        action=gather_action,
        method="POST",
        timeout=10,
        finish_on_key=""      # Wait for exactly 1 digit
    )

    # Bilingual prompt (Hindi + English)
    reminder_text = (
        f"Namaste. Yeh Medisync ki taraf se ek yaad-dahaani hai. "
        f"Kya aapne apni {medicine_name} dawai le li hai? "
        f"Agar haan, toh 1 dabayein. "
        f"Agar nahi, toh 2 dabayein."
    )
    gather.say(reminder_text, language="hi-IN", voice="Polly.Aditi")

    response.append(gather)

    # Fallback if patient doesn't press anything
    response.say(
        "Humein koi input nahi mila. Kripya apni dawai samay par lena na bhoolein. Dhanyawad.",
        language="hi-IN",
        voice="Polly.Aditi"
    )

    logger.info(f"📞 Webhook served for user={user_id[:8]} med={medicine_name} slot={slot}")
    return str(response)


# ── 3. Gather Response: Process the Keypress ──────────────────────────────────

@router.post("/gather-response", response_class=HTMLResponse, summary="Twilio webhook: DTMF digit received")
async def gather_response(
    request: Request,
    user_id: str,
    med_id: str,
    medicine_name: str,
    slot: str,
    is_critical: str = "false"
):
    """
    Twilio POSTs here with the digit the patient pressed.
    - Digit 1 → Mark dose as TAKEN, play thank-you message
    - Digit 2 → Log as pending/not-taken, play reminder message
    - Other   → Play an error prompt
    """
    form_data = await request.form()
    digit = form_data.get("Digits", "").strip()

    logger.info(f"🔢 DTMF digit received: '{digit}' for user={user_id[:8]} med={medicine_name}")

    response = VoiceResponse()
    is_crit_bool = is_critical.lower() == "true"

    if digit == "1":
        # ── Patient confirmed they took the medicine ──
        msg = process_voice_adherence(
            user_id=user_id,
            med_id=med_id,
            medicine_name=medicine_name,
            status="taken",
            slot_key=slot,
            is_critical=is_crit_bool
        )
        # Play a warm thank-you acknowledgement
        response.say(
            f"Shukriya aapke jawab ke liye. {msg} Apna khayal rakhein. Allah Hafiz.",
            language="hi-IN",
            voice="Polly.Aditi"
        )
        logger.info(f"✅ Dose TAKEN confirmed via DTMF for user={user_id[:8]}, med={medicine_name}")

    elif digit == "2":
        # ── Patient said they haven't taken it yet ──
        response.say(
            f"Shukriya aapke jawab ke liye. "
            f"Kripya apni {medicine_name} ki dawai jald se jald le lein. "
            f"Aapki sehat hamari zimmedari hai. Dhanyawad aur apna khayal rakhein.",
            language="hi-IN",
            voice="Polly.Aditi"
        )
        logger.info(f"⚠️ Dose NOT TAKEN reported via DTMF for user={user_id[:8]}, med={medicine_name}")

    else:
        # ── Unrecognized input ──
        response.say(
            "Humein sahi input nahi mili. Kripya 1 ya 2 dabayein. Dhanyawad.",
            language="hi-IN",
            voice="Polly.Aditi"
        )
        logger.warning(f"Unknown DTMF digit '{digit}' for user={user_id[:8]}")

    return str(response)
