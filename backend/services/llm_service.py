"""
services/llm_service.py — Google Gemini LLM integration for Medisync.

Provides:
  - call_gemini(): Generic Gemini API call with rate-limit handling
  - fallback_parse_medicines(): Extract medicines from OCR text
  - parse_insights(): Extract clinical context from OCR text
  - analyze_prescription_deep(): Full prescription intelligence
  - chat_with_gemini(): Conversational chatbot with Hindi/English support
  - normalize_schedule(): Convert timing strings → time slots
  - calculate_expiry(): Convert duration strings → expiry datetime

Rate-Limit Strategy:
  - Exponential backoff on 429 responses (2s → 4s → 8s)
  - In-memory response cache (hash of prompt → result) to avoid duplicate calls
  - Max 3 retries per call
"""

import os
import re
import json
import time
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict

import requests
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("Medisync.LLM")

# ─── Config ───────────────────────────────────────────────────────────────────

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# ─── Response Cache (avoid duplicate LLM calls → saves rate limit) ────────────
_llm_cache: Dict[str, dict] = {}
_CACHE_MAX_SIZE = 50  # evict oldest when full


def call_groq(system_prompt: str, user_text: str, temperature: float = 0.3, expect_json: bool = False) -> Optional[dict]:
    """
    Call Groq API (Llama 3) for fast text generation.
    Used for Chat, Insights, and Voice to save Gemini limits.
    """
    if not GROQ_API_KEY:
        logger.warning("GROQ_API_KEY missing. Falling back to Gemini.")
        # Fallback to Gemini if Groq isn't configured
        return call_gemini(f"{system_prompt}\n\n{user_text}", "", temperature, expect_json)
        
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text}
        ],
        "temperature": temperature,
    }
    if expect_json:
        payload["response_format"] = {"type": "json_object"}
        
    try:
        resp = requests.post(GROQ_API_URL, headers=headers, json=payload, timeout=15)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        
        if expect_json:
            # Clean up markdown JSON blocks if present
            clean = content.strip()
            if clean.startswith("```json"): clean = clean[7:]
            if clean.startswith("```"): clean = clean[3:]
            if clean.endswith("```"): clean = clean[:-3]
            return json.loads(clean.strip())
            
        return {"text": content.strip()}
    except Exception as e:
        logger.error(f"Groq API Error: {e}")
        return None


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

_PROMPT_PRESCRIPTION_INTELLIGENCE = """You are an advanced medical prescription understanding AI.

Your job is to analyze OCR text from a prescription image and extract structured medical intelligence.

The prescription may contain messy handwriting, abbreviations, partial words, mixed English terminology, and incomplete dosage instructions. Use contextual reasoning to infer the most likely interpretation.

SCHEDULE PARSING RULES:
- 1-0-1 → morning + night
- 1-1-1 → morning + afternoon + night
- 0-0-1 → night only
- SOS → as needed
- OD → once daily
- BD → twice daily
- TDS → three times daily
- HS → before sleep
- AC → before food
- PC → after food

MEDICINE NORMALIZATION RULES:
Correct likely OCR mistakes using medical context. Map brand names to generic names.
Never hallucinate dangerous medicines. If uncertain, set confidence to "low".

DISEASE EXTRACTION RULES:
Extract diagnosis, probable disease, symptoms, infection type, chronic conditions.
- URI → Upper Respiratory Infection
- HTN → Hypertension
- DM → Diabetes Mellitus

OUTPUT FORMAT — Return ONLY valid JSON with this exact structure:
{
  "patient_summary": {
    "probable_conditions": [],
    "symptoms": [],
    "medical_advice": [],
    "follow_up": "",
    "risk_flags": []
  },
  "medicines": [
    {
      "name": "",
      "normalized_name": "",
      "dosage": "",
      "timing_raw": "",
      "timing_interpreted": "",
      "duration": "",
      "food_instruction": "",
      "purpose": "",
      "confidence": ""
    }
  ],
  "tests_recommended": [],
  "doctor_notes": [],
  "patient_memory": {
    "active_conditions": [],
    "chronic_conditions": [],
    "medicine_history": [],
    "allergies": [],
    "health_risks": [],
    "important_notes": []
  }
}

Use null if information is unavailable.
Maintain strict JSON validity.
Do not add markdown, explanation, or extra text.
"""

_PROMPT_SCAN_VISION = """You are an advanced medical prescription understanding AI integrated into the Medisync healthcare system.

You are looking at a photo of a medical prescription. The prescription may contain:
- Very messy doctor handwriting
- Abbreviations (BD, TDS, OD, SOS, HS, AC, PC)
- Partial words
- Mixed English medical terminology
- Incomplete dosage instructions

Your job: Extract ALL structured medical data from this prescription image.

SCHEDULE PARSING RULES:
- 1-0-1 → morning + night
- 1-1-1 → morning + afternoon + night
- 0-0-1 → night only
- SOS → as needed
- OD → once daily
- BD → twice daily
- TDS → three times daily
- HS → before sleep
- AC → before food
- PC → after food

MEDICINE NORMALIZATION:
- Map brand names to generic pharmaceutical names
- Correct likely OCR/handwriting mistakes using medical context
- Examples: "Azee" → Azithromycin, "PCM" → Paracetamol, "Augmntin" → Augmentin, "Pantocid" → Pantoprazole
- Never hallucinate dangerous medicines
- If uncertain, set confidence to "low"

DISEASE EXTRACTION:
- URI → Upper Respiratory Infection
- HTN → Hypertension
- DM → Diabetes Mellitus
- Extract diagnosis, symptoms, infection type, chronic conditions

Return ONLY valid JSON with this exact structure:
{
  "patient_summary": {
    "probable_conditions": [],
    "symptoms": [],
    "medical_advice": [],
    "follow_up": "",
    "risk_flags": []
  },
  "medicines": [
    {
      "name": "",
      "normalized_name": "",
      "dosage": "",
      "timing_raw": "",
      "timing_interpreted": "",
      "duration": "",
      "food_instruction": "",
      "purpose": "",
      "confidence": "high/medium/low"
    }
  ],
  "tests_recommended": [],
  "doctor_notes": [],
  "patient_memory": {
    "active_conditions": [],
    "chronic_conditions": [],
    "medicine_history": [],
    "allergies": [],
    "health_risks": [],
    "important_notes": []
  }
}

IMPORTANT:
- Return JSON only. No markdown, no explanation, no extra text.
- Use null if information is unavailable.
- Be conservative — mark uncertain extractions as "low" confidence.
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


def _cache_key(system_prompt: str, user_text: str) -> str:
    """Generate a hash key for caching LLM responses."""
    content = f"{system_prompt}|||{user_text}"
    return hashlib.md5(content.encode()).hexdigest()


def call_gemini(
    system_prompt: str,
    user_text: str,
    max_retries: int = 3,
    temperature: float = 0.0,
    expect_json: bool = True,
) -> dict | str:
    """
    Call Google Gemini API with rate-limit handling and response caching.

    Rate-limit strategy:
      - Exponential backoff on 429 (2s, 4s, 8s)
      - Cache responses to avoid duplicate calls
      - Max 3 retries

    Args:
        system_prompt: Instructions for the model
        user_text:     The OCR / user content to process
        max_retries:   Number of retry attempts on transient failure
        temperature:   0 for deterministic extraction, higher for chat
        expect_json:   If True, parse response as JSON dict; if False, return raw text

    Returns:
        Parsed dict (if expect_json) or string from Gemini response, or {} / "" on failure
    """
    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY is not set.")
        return {} if expect_json else ""

    # ── Check cache ───────────────────────────────────────────────
    cache_k = _cache_key(system_prompt, user_text)
    if cache_k in _llm_cache:
        logger.info("⚡ LLM cache hit — returning cached response")
        return _llm_cache[cache_k]

    url = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}"
    headers = {"Content-Type": "application/json"}

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": f"{system_prompt}\n\n---\n\n{user_text}"}
                ]
            }
        ],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": 2048,
        },
    }

    # If we want JSON output, tell Gemini
    if expect_json:
        payload["generationConfig"]["responseMimeType"] = "application/json"

    backoff = 2  # initial backoff seconds

    for attempt in range(1, max_retries + 1):
        try:
            if attempt == 1:
                logger.info("🤖 Calling Gemini API...")
            else:
                logger.info(f"🔄 Retrying failed Gemini API call (retry {attempt-1}/{max_retries-1})...")
                
            resp = requests.post(url, headers=headers, json=payload, timeout=30)

            # ── Rate limit handling ───────────────────────────────
            if resp.status_code == 429:
                wait_time = backoff * (2 ** (attempt - 1))  # exponential: 2, 4, 8
                logger.warning(f"⏳ Gemini rate limited (429) — waiting {wait_time}s before retry...")
                time.sleep(wait_time)
                continue

            resp.raise_for_status()

            data = resp.json()
            raw_content = data["candidates"][0]["content"]["parts"][0]["text"]
            logger.info(f"✅ Gemini response received ({len(raw_content)} chars)")

            if expect_json:
                cleaned = _clean_json(raw_content)
                parsed = json.loads(cleaned)
                # Cache the result
                if len(_llm_cache) >= _CACHE_MAX_SIZE:
                    oldest_key = next(iter(_llm_cache))
                    del _llm_cache[oldest_key]
                _llm_cache[cache_k] = parsed
                return parsed
            else:
                if len(_llm_cache) >= _CACHE_MAX_SIZE:
                    oldest_key = next(iter(_llm_cache))
                    del _llm_cache[oldest_key]
                _llm_cache[cache_k] = raw_content
                return raw_content

        except requests.exceptions.HTTPError as http_err:
            logger.error(f"HTTP error from Gemini (attempt {attempt}): {http_err}")
            if attempt < max_retries:
                time.sleep(backoff)
        except (json.JSONDecodeError, KeyError, IndexError) as parse_err:
            logger.error(f"Gemini parse error (attempt {attempt}): {parse_err}")
        except requests.exceptions.RequestException as req_err:
            logger.error(f"Request error (attempt {attempt}): {req_err}")
            if attempt < max_retries:
                time.sleep(backoff)

    logger.error("❌ All Gemini retry attempts exhausted — returning empty.")
    return {} if expect_json else ""


# ─── Public API ───────────────────────────────────────────────────────────────

def fallback_parse_medicines(unknown_text: str) -> list:
    """
    Call LLM to extract medicine list from unknown OCR text fragments.

    We intentionally do NOT validate against MEDICINE_DICTIONARY here —
    the whole point of the fallback is to handle medicines not in our dictionary
    (e.g. Indian brand names like Udiliv, Alphacin, Upmune, Chymoral Plus).

    Returns:
        List of structured medicine dictionaries.
    """
    if not unknown_text.strip():
        return []

    full_prompt = f"Raw Unmatched OCR Text:\n\n{unknown_text}"
    llm_resp = call_gemini(_PROMPT_MEDICINES_FALLBACK, full_prompt)

    if not isinstance(llm_resp, dict):
        return []

    raw_medicines = llm_resp.get("medicines", [])
    valid_medicines = []

    for med in raw_medicines:
        name = (med.get("name") or "").strip()
        if not name or len(name) < 2:
            continue
        med["confidence"] = 0.75
        valid_medicines.append(med)
        logger.info(f"LLM fallback extracted: '{name}'")

    return valid_medicines


def parse_insights(ocr_text: str) -> dict:
    """
    Call LLM to extract clinical insights from OCR text.

    Returns:
        {"possible_condition": ..., "doctor_advice": ..., "precautions": ...}
    """
    full_prompt = f"OCR Text from prescription:\n\n{ocr_text}"
    result = call_gemini(_PROMPT_INSIGHTS, full_prompt)
    return result if isinstance(result, dict) else {}


def analyze_prescription_deep(ocr_text: str) -> dict:
    """
    Call Gemini with the full prescription intelligence prompt.

    This is the LLM enrichment pass — called AFTER the deterministic parser
    has done its work. The LLM fills gaps: disease inference, patient memory,
    advice, risk flags, and normalizes anything the regex couldn't.

    Returns:
        Full structured dict matching PrescriptionIntelligenceResponse schema, or {} on failure.
    """
    full_prompt = f"Raw OCR Text from prescription:\n\n{ocr_text}"
    result = call_gemini(_PROMPT_PRESCRIPTION_INTELLIGENCE, full_prompt, temperature=0.0)

    if not result:
        logger.warning("LLM prescription intelligence returned empty — using deterministic-only results.")

    return result if isinstance(result, dict) else {}


def scan_prescription_with_vision(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """
    Send prescription image DIRECTLY to Gemini Vision API.

    No PaddleOCR needed — Gemini reads the image and extracts:
      - All medicines with normalized names
      - Dosage schedules (1-0-1, BD, TDS, etc.)
      - Diseases, symptoms, advice
      - Patient memory context

    Rate-limit safe: uses exponential backoff + image hash caching.

    Args:
        image_bytes: Raw image bytes from uploaded file
        mime_type:   MIME type of the image (image/jpeg, image/png, etc.)

    Returns:
        Structured dict matching PrescriptionIntelligenceResponse schema, or {} on failure.
    """
    import base64

    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY is not set.")
        return {}

    # ── Cache check (hash the image to avoid re-processing same prescription) ──
    img_hash = hashlib.md5(image_bytes).hexdigest()
    cache_k = f"vision_{img_hash}"
    if cache_k in _llm_cache:
        logger.info("⚡ Vision cache hit — returning cached scan result")
        return _llm_cache[cache_k]

    # ── Encode image to base64 ────────────────────────────────────
    img_b64 = base64.b64encode(image_bytes).decode("utf-8")

    url = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}"
    headers = {"Content-Type": "application/json"}

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": _PROMPT_SCAN_VISION},
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": img_b64,
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 4096,
            "responseMimeType": "application/json",
        },
    }

    backoff = 2
    max_retries = 3

    for attempt in range(1, max_retries + 1):
        try:
            if attempt == 1:
                logger.info("📸 Sending FULL prescription image to Gemini in a SINGLE request...")
            else:
                logger.info(f"🔄 Retrying failed request (retry {attempt-1}/{max_retries-1})...")
            
            resp = requests.post(url, headers=headers, json=payload, timeout=60)

            # ── Rate limit ────────────────────────────────────────
            if resp.status_code == 429:
                wait_time = backoff * (2 ** (attempt - 1))
                logger.warning(f"⏳ Gemini rate limited (429) — waiting {wait_time}s...")
                time.sleep(wait_time)
                continue

            resp.raise_for_status()

            data = resp.json()
            raw_content = data["candidates"][0]["content"]["parts"][0]["text"]
            logger.info(f"✅ Gemini Vision response: {len(raw_content)} chars")

            cleaned = _clean_json(raw_content)
            parsed = json.loads(cleaned)

            # Cache it
            if len(_llm_cache) >= _CACHE_MAX_SIZE:
                oldest_key = next(iter(_llm_cache))
                del _llm_cache[oldest_key]
            _llm_cache[cache_k] = parsed

            return parsed

        except requests.exceptions.HTTPError as http_err:
            logger.error(f"Gemini Vision HTTP error (attempt {attempt}): {http_err}")
            # Log response body for debugging
            try:
                logger.error(f"Response body: {resp.text[:500]}")
            except Exception:
                pass
            if attempt < max_retries:
                time.sleep(backoff)
        except (json.JSONDecodeError, KeyError, IndexError) as parse_err:
            logger.error(f"Gemini Vision parse error (attempt {attempt}): {parse_err}")
        except requests.exceptions.RequestException as req_err:
            logger.error(f"Gemini Vision request error (attempt {attempt}): {req_err}")
            if attempt < max_retries:
                time.sleep(backoff)

    logger.error("❌ All Gemini Vision retries exhausted — returning empty.")
    return {}

def chat_with_gemini(
    user_data: dict,
    question: str,
    language: str = "en",
) -> str:
    """
    Conversational chatbot using Google Gemini.

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

    # Build patient memory context (accumulated from prescription scans)
    memory_context = ""
    patient_mem = user_data.get("patient_memory", {})
    if patient_mem:
        mem_parts = []
        if patient_mem.get("active_conditions"):
            mem_parts.append(f"Active conditions: {', '.join(patient_mem['active_conditions'])}")
        if patient_mem.get("chronic_conditions"):
            mem_parts.append(f"Chronic conditions: {', '.join(patient_mem['chronic_conditions'])}")
        if patient_mem.get("medicine_history"):
            mem_parts.append(f"Medicine history: {', '.join(patient_mem['medicine_history'][-10:])}")
        if patient_mem.get("allergies"):
            mem_parts.append(f"Known allergies: {', '.join(patient_mem['allergies'])}")
        if patient_mem.get("health_risks"):
            mem_parts.append(f"Health risks: {', '.join(patient_mem['health_risks'])}")
        if mem_parts:
            memory_context = "\n\nPatient Medical History (from previous prescriptions):\n" + "\n".join(mem_parts)

    system_prompt = f"""You are Medisync, a friendly and highly secure healthcare assistant for medication adherence.

{lang_instruction}

Guidelines:
- Give short, clear, and helpful answers (2–4 sentences max).
- You can suggest taking medicine on time, drinking water, resting, etc.
- NEVER recommend changing doses or stopping medicine without doctor advice.
- NEVER diagnose serious conditions.
- If the question is outside your scope, say 'Please consult your doctor.'
- ALWAYS append this exact disclaimer at the end of your response: "*Disclaimer: I am an AI, not a doctor. Always consult your physician for medical decisions.*"
- Use the patient's medical history to give personalized, contextual answers, but do not hallucinate conditions they don't have.
{med_context}
{missed_dose_hint}
{memory_context}
"""

    if not GROQ_API_KEY:
        logger.warning("GROQ_API_KEY missing, falling back to Gemini for chat.")

    result = call_groq(
        system_prompt=system_prompt,
        user_text=question,
        temperature=0.4,
        expect_json=False,
    )

    if not result:
        return "Sorry, I'm having trouble connecting right now. Please try again in a moment."

    return result if isinstance(result, str) else str(result)


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


def generate_smart_adherence_report(analytics_data: dict, patient_memory: dict) -> dict:
    """
    Generate an intelligent AI report on the patient's medicine adherence.
    """
    prompt = """You are a highly intelligent healthcare AI assistant.
Your job is to analyze the patient's adherence analytics and their medical history to generate a smart report.

Analyze the data for:
1. Irregular patterns
2. Most missed critical medicines (especially antibiotics or chronic condition meds)
3. Timing issues
4. Overall risks

Return a JSON with this structure:
{
  "report_text": "A friendly, easy-to-read summary paragraph analyzing their adherence.",
  "critical_alerts": ["Alert 1", "Alert 2"],
  "confidence_score": 0.95
}
"""

    user_text = f"Analytics Data: {json.dumps(analytics_data)}\n\nPatient Memory: {json.dumps(patient_memory)}"
    result = call_groq(prompt, user_text, temperature=0.3, expect_json=True)
    if result and isinstance(result, dict):
        return result
    return {
        "report_text": "Unable to generate smart report at this time.",
        "critical_alerts": [],
        "confidence_score": 0.0
    }
