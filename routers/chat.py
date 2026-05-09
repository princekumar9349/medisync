"""
routers/chat.py — Chatbot endpoint for Medisync.

Routes:
  POST /chat — Ask the AI health assistant a question  [PROTECTED]

Supports Hindi and English responses via Groq LLM.
Personalizes answers using the user's current medicine context.
Auto-suggests consulting a doctor when serious symptoms are detected.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from db import database
from models.schemas import ChatRequest, ChatResponse, TokenData
from services.auth_service import get_current_user
from services.llm_service import chat_with_groq

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

    # ── Call Groq LLM ─────────────────────────────────────────────
    logger.info(
        f"💬 Chat request from user {current_user.user_id[:8]}... "
        f"— lang: {payload.language}"
    )

    try:
        answer = chat_with_groq(
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
            "\n\n⚠️ **This sounds serious.** Please consult your doctor immediately "
            "or visit the nearest emergency room.\n"
            "👉 You can also message your doctor directly via the **Doctor Chat** tab."
            if payload.language == "en"
            else
            "\n\n⚠️ **यह गंभीर लग रहा है।** कृपया तुरंत अपने डॉक्टर से मिलें।\n"
            "👉 आप **Doctor Chat** टैब से सीधे डॉक्टर को संदेश भेज सकते हैं।"
        )
        answer = answer + advisory
        logger.info(
            f"⚠️  Serious keyword in question — advisory appended for user "
            f"{current_user.user_id[:8]}..."
        )

    return ChatResponse(response=answer)


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
