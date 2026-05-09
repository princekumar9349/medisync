"""
services/llm_service.py — Groq LLM integration for Medisync.

Provides:
  - call_llm(): Generic Groq API call (prescription parsing)
  - parse_medicines(): Extract medicines from OCR text
  - parse_insights(): Extract clinical context from OCR text
  - chat_with_groq(): Conversational chatbot with Hindi/English support
  - normalize_schedule(): Convert timing strings → time slots
  - calculate_expiry(): Convert duration strings → expiry datetime
"""

import os
import re
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, List

import requests
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("Medisync.LLM")

# ─── Config ───────────────────────────────────────────────────────────────────

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")

# ─── Prompts ──────────────────────────────────────────────────────────────────

_PROMPT_MEDICINES_FALLBACK = """
You are a medical data extraction fallback assistant. Some text from a prescription could not be parsed deterministically.
Extract any valid medicines from this raw text.

Output MUST be a valid JSON object with a single key 'medicines' containing a list of objects:
  - 'name': medicine name (string)
  - 'dosage': amount + unit e.g. '500mg' (string)
  - 'morning': boolean
  - 'afternoon': boolean
  - 'night': boolean
  - 'sos': boolean
  - 'duration': how long e.g. '5 days' (string)

Do NOT invent medicines. Only extract what is clearly a medicine.
Do NOT include markdown, explanation, or extra text — output ONLY the JSON.
"""

_PROMPT_INSIGHTS = """
You are a medical insight assistant. Analyze the OCR text of a medical prescription
and infer clinical context.

Output MUST be a valid JSON object with exactly these keys:
  - 'possible_condition': the likely medical condition or diagnosis (string)
  - 'doctor_advice':      any advice or instructions from the doctor (string)
  - 'precautions':        safety precautions or warnings (string)

If a field cannot be determined, use a reasonable default string.
Do NOT include markdown, explanation, or extra text — output ONLY the JSON.
"""


# ─── Internal Helpers ─────────────────────────────────────────────────────────

def _clean_json(raw: str) -> str:
    """Strip markdown code fences from LLM output before JSON parsing."""
    raw = raw.strip()
    if raw.startswith("```json"):
        raw = raw[7:]
    elif raw.startswith("```"):
        raw = raw[3:]
    if raw.endswith("```"):
        raw = raw[:-3]
    return raw.strip()


def call_llm(
    system_prompt: str,
    user_text: str,
    max_retries: int = 3,
    temperature: float = 0.0,
) -> dict:
    """
    Call Groq LLM and return parsed JSON dict.

    Args:
        system_prompt: Instructions for the model
        user_text:     The OCR / user content to process
        max_retries:   Number of retry attempts on transient failure
        temperature:   0 for deterministic extraction, higher for chat

    Returns:
        Parsed dict from LLM JSON response, or {} on failure
    """
    if not GROQ_API_KEY or GROQ_API_KEY == "your_api_key_here":
        logger.error("GROQ_API_KEY is not set.")
        return {}

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text},
        ],
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"🤖 Calling Groq LLM (attempt {attempt}/{max_retries})...")
            resp = requests.post(GROQ_API_URL, headers=headers, json=payload, timeout=30)
            resp.raise_for_status()

            raw_content = resp.json()["choices"][0]["message"]["content"]
            logger.info(f"📨 LLM raw response: {raw_content[:300]}...")

            cleaned = _clean_json(raw_content)
            parsed = json.loads(cleaned)
            logger.info(f"✅ LLM JSON parsed successfully.")
            return parsed

        except requests.exceptions.HTTPError as http_err:
            logger.error(f"HTTP error from Groq (attempt {attempt}): {http_err}")
        except (json.JSONDecodeError, KeyError) as parse_err:
            logger.error(f"LLM parse error (attempt {attempt}): {parse_err}")
        except requests.exceptions.RequestException as req_err:
            logger.error(f"Request error (attempt {attempt}): {req_err}")

        if attempt < max_retries:
            logger.info("🔁 Retrying LLM call...")

    logger.error("❌ All LLM retry attempts exhausted — returning empty dict.")
    return {}


# ─── Public API ───────────────────────────────────────────────────────────────

def fallback_parse_medicines(unknown_text: str) -> list:
    """
    Call LLM to extract medicine list from unknown OCR text fragments.
    
    ⚠️  We intentionally do NOT validate against MEDICINE_DICTIONARY here —
    the whole point of the fallback is to handle medicines not in our dictionary
    (e.g. Indian brand names like Udiliv, Alphacin, Upmune, Chymoral Plus).
    
    Returns:
        List of structured medicine dictionaries.
    """
    if not unknown_text.strip():
        return []

    full_prompt = f"Raw Unmatched OCR Text:\n\n{unknown_text}"
    llm_resp = call_llm(_PROMPT_MEDICINES_FALLBACK, full_prompt)

    raw_medicines = llm_resp.get("medicines", [])
    valid_medicines = []

    for med in raw_medicines:
        name = (med.get("name") or "").strip()
        if not name or len(name) < 2:
            continue
        # Accept the LLM result as-is (it was trained on medical data)
        med["confidence"] = 0.75   # mark as LLM-sourced, moderate confidence
        valid_medicines.append(med)
        logger.info(f"✅ LLM fallback extracted: '{name}'")

    return valid_medicines



def parse_insights(ocr_text: str) -> dict:
    """
    Call LLM to extract clinical insights from OCR text.

    Returns:
        {"possible_condition": ..., "doctor_advice": ..., "precautions": ...}
    """
    full_prompt = f"OCR Text from prescription:\n\n{ocr_text}"
    return call_llm(_PROMPT_INSIGHTS, full_prompt)


def chat_with_groq(
    user_data: dict,
    question: str,
    language: str = "en",
) -> str:
    """
    Conversational chatbot using Groq LLM.

    Behavior:
      - Answers medication / health questions
      - References user's own medicines if present in user_data
      - Responds in Hindi if language == 'hi', else English
      - Keeps responses short and safe (no dangerous advice)

    Args:
        user_data: Dict with user context (medicines, recent prescriptions, etc.)
        question:  User's question string
        language:  'en' or 'hi'

    Returns:
        Plain-text assistant response string
    """
    lang_instruction = (
        "Respond ONLY in Hindi (Devanagari script). Keep it brief and friendly."
        if language == "hi"
        else "Respond ONLY in English. Keep it brief and friendly."
    )

    # Build context from user's current medicines
    med_context = ""
    if user_data.get("medicines"):
        med_names = [m.get("name", "") for m in user_data["medicines"] if m.get("name")]
        if med_names:
            med_context = f"\nUser's current medicines: {', '.join(med_names)}"

    missed_dose_hint = ""
    if user_data.get("missed_doses"):
        missed_dose_hint = (
            f"\nUser has missed these doses recently: {user_data['missed_doses']}. "
            "Gently remind them to take their medicine."
        )

    system_prompt = f"""You are Medisync, a friendly and safe healthcare assistant for medication adherence.

{lang_instruction}

Guidelines:
- Give short, clear, and helpful answers (2–4 sentences max).
- You can suggest taking medicine on time, drinking water, resting, etc.
- NEVER recommend changing doses or stopping medicine without doctor advice.
- NEVER diagnose serious conditions.
- If the question is outside your scope, say 'Please consult your doctor.'
{med_context}
{missed_dose_hint}
"""

    if not GROQ_API_KEY or GROQ_API_KEY == "your_api_key_here":
        return "Chatbot is currently unavailable. Please set GROQ_API_KEY in your .env file."

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ],
        "temperature": 0.4,      # slight creativity for natural chat
        "max_tokens": 300,       # keep responses concise
    }

    try:
        logger.info(f"💬 Chat LLM call — language: {language}")
        resp = requests.post(GROQ_API_URL, headers=headers, json=payload, timeout=20)
        resp.raise_for_status()
        answer = resp.json()["choices"][0]["message"]["content"].strip()
        logger.info(f"💬 Chat response: {answer[:100]}...")
        return answer
    except Exception as e:
        logger.error(f"Chat LLM error: {e}")
        return "Sorry, I'm having trouble connecting right now. Please try again in a moment."


# ─── Schedule Utilities ───────────────────────────────────────────────────────

def normalize_schedule(timing: str) -> List[str]:
    """
    Convert raw timing strings to standardized time slots.

    Examples:
      'BD' → ['morning', 'night']
      'TDS' → ['morning', 'afternoon', 'night']
      'at night' → ['night']
      'OD' / 'once daily' → ['morning']
    """
    t = timing.lower()

    if any(x in t for x in ["three times", "thrice", "tds", "t.i.d", "tid"]):
        return ["morning", "afternoon", "night"]
    elif any(x in t for x in ["twice", "bd", "b.i.d", "bid", "two times"]):
        return ["morning", "night"]
    elif any(x in t for x in ["night", "bedtime", "hs", "nocte"]):
        return ["night"]
    elif any(x in t for x in ["morning", "od", "once", "daily", "qd"]):
        return ["morning"]
    elif any(x in t for x in ["afternoon", "noon", "midday"]):
        return ["afternoon"]

    return []


def calculate_expiry(duration: str) -> Optional[datetime]:
    """
    Compute expiry date from a duration string.

    Examples:
      '5 days'   → now + 5 days
      '2 weeks'  → now + 14 days
      '1 month'  → now + 30 days
    """
    d = duration.lower()
    nums = [int(n) for n in re.findall(r"\d+", d)]
    if not nums:
        return None

    val = nums[0]
    if "month" in d:
        days = val * 30
    elif "week" in d:
        days = val * 7
    else:
        days = val   # assume days

    return datetime.utcnow() + timedelta(days=days)
