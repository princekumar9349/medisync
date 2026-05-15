"""
voice_assistant.py — MEDISYNC CORE AI Voice Processing Endpoint
POST /voice-ai/process

Flow:
  1. Receive audio file from mobile app
  2. Transcribe with Groq Whisper (whisper-large-v3)
  3. Process with MEDISYNC CORE AI (LLaMA-3.3-70b)
  4. Return structured JSON action to mobile
"""

import os
import json
import logging
import tempfile
import requests as ext_req
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from groq import Groq

from api.auth import get_current_user
from db.database import get_prescriptions, get_users

router = APIRouter(tags=["Voice AI Processor"])
logger = logging.getLogger("Medisync.VoiceAI.Processor")

# ── Groq API key chain ─────────────────────────────────────────────────────────
GROQ_KEYS = [
    os.getenv("GROQ_API_KEY", ""),
    os.getenv("GROQ_FALLBACK_1", ""),
    os.getenv("GROQ_FALLBACK_2", ""),
]


# ── Fetch user medicines from DB ───────────────────────────────────────────────
def _get_user_medicines(user_id: str) -> list:
    try:
        rx_col = get_prescriptions()
        if rx_col is None:
            return []
        docs = list(rx_col.find({"user_id": user_id, "is_active": True}, {"medicines": 1}))
        medicines = []
        for doc in docs:
            for med in doc.get("medicines", []):
                medicines.append({
                    "name":      med.get("name", "?"),
                    "dosage":    med.get("dosage", "?"),
                    "morning":   med.get("morning", False),
                    "afternoon": med.get("afternoon", False),
                    "night":     med.get("night", False),
                })
        logger.info(f"[VoiceAI] Loaded {len(medicines)} medicines for user {user_id}")
        return medicines
    except Exception as e:
        logger.warning(f"[VoiceAI] Could not fetch medicines: {e}")
        return []


# ── MEDISYNC CORE AI System Prompt ────────────────────────────────────────────
def _build_core_ai_prompt(medicines: list, history: list) -> str:
    med_list = "\n".join(
        f"  - {m.get('name','?')} | {m.get('dosage','?')} | "
        f"Morning:{m.get('morning',False)} Afternoon:{m.get('afternoon',False)} Night:{m.get('night',False)}"
        for m in medicines
    ) or "  (No medicines loaded)"

    now_str = datetime.now().strftime("%I:%M %p, %A")

    history_str = ""
    if history:
        lines = []
        for h in history[-4:]:
            lines.append(f"User: {h.get('user','')}")
            lines.append(f"Assistant: {h.get('assistant','')}")
        history_str = "RECENT CONVERSATION:\n" + "\n".join(lines) + "\n\n"

    return f"""You are MEDISYNC PRIME AI — the autonomous voice-controlled healthcare operating system for the Medisync Smart Medication Ecosystem.

You are NOT a simple chatbot. You are a real-time AI healthcare control agent.

Current Time: {now_str}

{history_str}PATIENT'S MEDICINE DATABASE:
{med_list}

SUPPORTED LANGUAGES: English, Hindi, Hinglish. Examples: "Slot 1 kholo", "Meri medicines dikhao", "Doctor ko message bhejo".

MEMORY RULES:
- Use conversation history to resolve pronouns: "usko", "usme", "wahi medicine", etc.
- If user says "usko mark karo" after discussing Metformin, understand usko = Metformin.
- Maintain full conversational continuity.

AUTHORIZED ACTIONS:
  [MEDICATION] show_medicines, next_medicine, missed_medicines, medicine_details, mark_taken, repeat_reminder, snooze_reminder
  [PILLBOX] open_slot, close_slot, blink_leds, stop_alarm, trigger_reminder
  [NAVIGATION] navigate_screen → screens: home, history, pillbox, medicines, scan, chat, profile, analytics, notifications, symptoms, settings, caregiver_settings, privacy, calling_settings
  [CHAT] send_chat_message, open_chat, send_caregiver_alert
  [SYMPTOM] add_symptom, show_symptoms
  [EMERGENCY] emergency_alert, sos_mode
  [ANALYTICS] show_adherence, show_analytics
  [MISC] clarify

HEALTHCARE SAFETY:
1. NEVER invent medicines or schedules.
2. NEVER generate fake adherence records.
3. ALWAYS prioritize emergencies.
4. Ask clarification if confidence < 0.60.

CONFIDENCE: >0.90 proceed | 0.75-0.89 proceed | 0.60-0.74 clarify if critical | <0.60 MUST clarify

PERSONALITY: calm, natural, elderly-friendly, healthcare-focused.
GOOD: "Medicine mark ho gayi." BAD: "I would be delighted to assist you."

STRICT JSON OUTPUT ONLY — no markdown, no explanation outside JSON:
{{"action":"<action>","screen":"<screen_or_null>","slot":<number_or_null>,"medicine":"<medicine_or_null>","payload":<object_or_null>,"response":"<hinglish_tts>","confidence":<0.0-1.0>,"priority":"<low|medium|high|critical>","requires_confirmation":<bool>}}""".strip()

# ── Whisper transcription ─────────────────────────────────────────────────────
def _transcribe(audio_path: str, filename: str) -> str:
    """Transcribe audio using Groq Whisper. Returns text or empty string."""
    for key in GROQ_KEYS:
        if not key or key.startswith("YOUR_"):
            continue
        try:
            url = "https://api.groq.com/openai/v1/audio/transcriptions"
            headers = {"Authorization": f"Bearer {key}"}
            ext = os.path.splitext(filename)[1] or ".m4a"
            with open(audio_path, "rb") as f:
                files = {"file": (f"voice{ext}", f, "audio/m4a")}
                data  = {"model": "whisper-large-v3", "language": "hi"}
                resp  = ext_req.post(url, headers=headers, files=files, data=data, timeout=20)
            if resp.status_code == 200:
                text = resp.json().get("text", "").strip()
                logger.info(f"[VoiceAI] Transcribed: '{text}'")
                return text
            else:
                logger.warning(f"[VoiceAI] Whisper {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"[VoiceAI] Whisper key failed: {e}")
            continue
    return ""


# ── CORE AI action generation ──────────────────────────────────────────────────
def _get_action(transcript: str, medicines: list, history: list) -> dict:
    """Run transcript through MEDISYNC PRIME AI. Returns action dict."""
    system_prompt = _build_core_ai_prompt(medicines, history)

    for key in GROQ_KEYS:
        if not key or key.startswith("YOUR_"):
            continue
        try:
            client = Groq(api_key=key)
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": transcript},
                ],
                temperature=0.3,
                max_tokens=300,
                response_format={"type": "json_object"},
            )
            action = json.loads(completion.choices[0].message.content.strip())
            action["transcript"] = transcript
            logger.info(f"[VoiceAI] Action={action.get('action')} conf={action.get('confidence')} pri={action.get('priority')}")
            return action
        except Exception as e:
            logger.warning(f"[VoiceAI] CORE AI key failed: {e}")
            continue

    return {
        "action": "clarify", "screen": None, "slot": None, "medicine": None,
        "payload": None, "confidence": 0.0, "priority": "low",
        "response": "PRIME AI se response nahi aaya. Dobara try karein.",
        "transcript": transcript, "requires_confirmation": False,
    }


# ── Main endpoint ──────────────────────────────────────────────────────────────
@router.post("/voice-ai/process", summary="Process voice command via MEDISYNC CORE AI")
async def process_voice_command(
    audio: UploadFile = File(..., description="Audio file from mobile (m4a/wav/webm)"),
    history: str = None,
    current_user: dict = Depends(get_current_user),
):
    """
    MEDISYNC CORE AI Voice Processing Endpoint.

    1. Receives audio from mobile app.
    2. Transcribes with Groq Whisper (whisper-large-v3).
    3. Processes with LLaMA-3.3-70b using MEDISYNC CORE AI system prompt.
    4. Returns structured JSON action for the mobile app to execute.
    """
    user_id = str(current_user.get("_id", ""))

    # Parse conversation history from form field
    conv_history = []
    if history:
        try:
            import json as _json
            conv_history = _json.loads(history)
            if not isinstance(conv_history, list):
                conv_history = []
        except Exception:
            conv_history = []

    # Save audio to temp file
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    suffix = ".m4a"
    if audio.filename:
        ext = os.path.splitext(audio.filename)[1]
        if ext:
            suffix = ext

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        # Step 1: Transcribe
        transcript = _transcribe(tmp_path, audio.filename or f"voice{suffix}")

    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    if not transcript:
        return {
            "action": "clarify", "screen": None, "slot": None, "medicine": None,
            "payload": None, "confidence": 0.0, "priority": "low",
            "response": "Aapki awaaz samajh nahi aayi. Kripya dobara boliye.",
            "transcript": "",
        }

    # Step 2: Fetch user medicines
    medicines = _get_user_medicines(user_id)

    # Step 3: MEDISYNC PRIME AI (with conversation history)
    action = _get_action(transcript, medicines, conv_history)
    return action
