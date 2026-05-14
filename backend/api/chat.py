"""
routers/chat.py — Chatbot endpoint for Medisync.

Routes:
  POST /chat — Ask the AI health assistant a question  [PROTECTED]

Supports Hindi and English responses via Google Gemini.
Personalizes answers using the user's current medicine context.
Auto-suggests consulting a doctor when serious symptoms are detected.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile

from db import database
from models.schemas import ChatRequest, ChatResponse, TokenData
from services.auth_service import get_current_user
from services.llm_service import chat_with_gemini
from security.rate_limit import RateLimiter

logger = logging.getLogger("Medisync.Chat")
router = APIRouter(tags=["Chatbot"])


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Ask the Medisync AI health assistant a question",
)
def chat(
    payload: ChatRequest,
    current_user: TokenData = Depends(get_current_user),
    _: None = Depends(RateLimiter(max_requests=30, window_seconds=900, prefix="chat")),
):
    """
    Conversational AI assistant for medication adherence support.

    Request body:
    ```json
    {
        "user_data": {},          // optional — medicine/prescription context
        "question": "Should I take paracetamol with food?",
        "language": "en"          // "en" for English, "hi" for Hindi
    }
    ```

    Behavior:
      - Fetches user's latest prescriptions to give personalized answers
      - Falls back to user_data from request if no DB records found
      - Answers are short, safe, and friendly
      - Will NOT recommend changing dosage or stopping medicine

    Returns:
    ```json
    { "response": "..." }
    ```
    """
    # ── Enrich user_data with real prescription context ───────────
    enriched_user_data = dict(payload.user_data)

    prescriptions_col = database.get_prescriptions()
    dose_logs_col = database.get_dose_logs()

    if prescriptions_col is not None:
        try:
            # Get user's most recent prescription
            latest_rx = prescriptions_col.find_one(
                {"user_id": current_user.user_id},
                {"medicines": 1, "_id": 0},
                sort=[("created_at", -1)],
            )
            if latest_rx and "medicines" not in enriched_user_data:
                enriched_user_data["medicines"] = latest_rx.get("medicines", [])
        except Exception as e:
            logger.warning(f"Could not fetch prescription context for chat: {e}")

    # ── Check for recent missed doses ─────────────────────────────
    if dose_logs_col is not None:
        try:
            from datetime import datetime, timedelta
            cutoff = datetime.utcnow() - timedelta(hours=24)
            missed = list(
                dose_logs_col.find(
                    {
                        "user_id": current_user.user_id,
                        "status": {"$in": ["missed", "skipped"]},
                        "timestamp": {"$gte": cutoff},
                    },
                    {"medicine_name": 1, "_id": 0},
                ).limit(5)
            )
            if missed:
                enriched_user_data["missed_doses"] = [
                    m.get("medicine_name", "unknown") for m in missed
                ]
        except Exception as e:
            logger.warning(f"Could not fetch missed dose context: {e}")

    # ── Inject accumulated patient memory ─────────────────────────
    try:
        from services.prescription_intelligence import get_patient_memory_for_chat
        patient_mem = get_patient_memory_for_chat(current_user.user_id)
        if patient_mem:
            enriched_user_data["patient_memory"] = patient_mem
            logger.info(f"Injected patient memory for user {current_user.user_id[:8]}...")
    except Exception as e:
        logger.warning(f"Could not fetch patient memory for chat: {e}")

    # ── Call Gemini LLM ───────────────────────────────────────────
    logger.info(
        f"Chat request from user {current_user.user_id[:8]}... "
        f"— lang: {payload.language}"
    )

    try:
        answer = chat_with_gemini(
            user_data=enriched_user_data,
            question=payload.question,
            language=payload.language,
        )
    except Exception as e:
        logger.error(f"Chat LLM error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chatbot is temporarily unavailable. Please try again.",
        )

    # ── Serious-symptom advisory ──────────────────────────────────
    if _needs_doctor_advisory(payload.question):
        advisory = (
            "\n\n**This sounds serious.** Please consult your doctor immediately "
            "or visit the nearest emergency room.\n"
            "You can also message your doctor directly via the **Doctor Chat** tab."
            if payload.language == "en"
            else
            "\n\n **यह गंभीर लग रहा है।** कृपया तुरंत अपने डॉक्टर से मिलें।\n"
            "आप **Doctor Chat** टैब से सीधे डॉक्टर को संदेश भेज सकते हैं।"
        )
        answer = answer + advisory
        logger.info(
            f"Serious keyword in question — advisory appended for user "
            f"{current_user.user_id[:8]}..."
        )

    return ChatResponse(response=answer)


@router.post(
    "/chat/audio",
    summary="Upload audio, transcribe, and ask the AI assistant",
)
async def chat_audio(
    file: UploadFile = File(...),
    language: str = "en",
    current_user: TokenData = Depends(get_current_user),
    _: None = Depends(RateLimiter(max_requests=5, window_seconds=900, prefix="chat_audio")),
):
    """
    Accepts an audio file (.m4a, .webm, etc.), transcribes it using Groq Whisper,
    and then passes the transcription to the Gemini conversational AI.
    Returns both the transcribed text and the AI's response.
    """
    import requests
    from services.llm_service import GROQ_API_KEY
    
    from security.upload_validator import validate_upload
    
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="Groq API key not configured for STT.")
        
    try:
        _, audio_bytes = await validate_upload(file)
        whisper_url = "https://api.groq.com/openai/v1/audio/transcriptions"
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
        files = {"file": (file.filename, audio_bytes, file.content_type)}
        data = {"model": "whisper-large-v3"}
        
        resp = requests.post(whisper_url, headers=headers, files=files, data=data, timeout=15)
        
        if resp.status_code != 200:
            logger.error(f"Groq STT failed: {resp.text}")
            raise HTTPException(status_code=500, detail="Failed to transcribe audio.")
            
        transcribed_text = resp.json().get("text", "").strip()
        if not transcribed_text:
            raise HTTPException(status_code=400, detail="Could not detect speech in audio.")
            
    except Exception as e:
        logger.error(f"Error during audio transcription: {e}")
        raise HTTPException(status_code=500, detail="Audio processing failed.")
        
    # Now pass the transcribed text to the existing chat logic
    # We will simulate a ChatRequest payload
    payload = ChatRequest(
        question=transcribed_text,
        language=language,
        user_data={}
    )
    
    chat_resp = chat(payload, current_user)
    
    return {
        "user_text": transcribed_text,
        "response": chat_resp.response,
        "language": language
    }



# ─── Serious Symptom Keywords ─────────────────────────────────────────────────
# If the user's question contains any of these, the AI reply gets a
# 'consult your doctor' advisory appended automatically.
_SERIOUS_TERMS = {
    "chest pain", "shortness of breath", "can't breathe", "unconscious",
    "seizure", "stroke", "heart attack", "bleeding", "severe pain",
    "allergic reaction", "anaphylaxis", "overdose", "faint", "paralysis",
    "vision loss", "sudden headache", "high fever", "vomiting blood",
    "सांस नहीं", "छाती में दर्द", "बेहोश", "दौरा", "तेज़ बुखार",
}


def _needs_doctor_advisory(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in _SERIOUS_TERMS)
