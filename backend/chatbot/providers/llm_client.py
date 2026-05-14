import os
import json
import requests
import logging
from typing import Optional

logger = logging.getLogger("Medisync.LLMProvider")

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

def _clean_json(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```json"): raw = raw[7:]
    elif raw.startswith("```"): raw = raw[3:]
    if raw.endswith("```"): raw = raw[:-3]
    return raw.strip()

def call_groq(system_prompt: str, user_text: str, temperature: float = 0.3, expect_json: bool = False) -> Optional[dict | str]:
    """Single-shot call to Groq. Exposes exceptions to the Gateway."""
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY missing")
        
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
        
    resp = requests.post(GROQ_API_URL, headers=headers, json=payload, timeout=15)
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    
    if expect_json:
        clean = _clean_json(content)
        return json.loads(clean.strip())
        
    return content.strip()

def call_gemini(
    system_prompt: str,
    user_text: str,
    temperature: float = 0.0,
    expect_json: bool = True,
) -> Optional[dict | str]:
    """Single-shot call to Gemini text model. Exposes exceptions to the Gateway."""
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY missing")

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

    if expect_json:
        payload["generationConfig"]["responseMimeType"] = "application/json"

    resp = requests.post(url, headers=headers, json=payload, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    
    raw_content = data["candidates"][0]["content"]["parts"][0]["text"]

    if expect_json:
        cleaned = _clean_json(raw_content)
        return json.loads(cleaned)
    else:
        return raw_content

def call_gemini_vision(
    system_prompt: str,
    image_bytes: bytes,
    mime_type: str = "image/jpeg"
) -> Optional[dict]:
    """Single-shot call to Gemini Vision model. Exposes exceptions to the Gateway."""
    import base64
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY missing")

    img_b64 = base64.b64encode(image_bytes).decode("utf-8")
    url = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}"
    headers = {"Content-Type": "application/json"}
    
    payload = {
        "contents": [{"parts": [{"text": system_prompt}, {"inlineData": {"mimeType": mime_type, "data": img_b64}}] }],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 4096, "responseMimeType": "application/json"},
    }

    resp = requests.post(url, headers=headers, json=payload, timeout=40)
    resp.raise_for_status()
    data = resp.json()
    raw_content = data["candidates"][0]["content"]["parts"][0]["text"]
    
    return json.loads(_clean_json(raw_content))
