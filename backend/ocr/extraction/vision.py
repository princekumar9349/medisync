import base64
import json
import requests
import logging
from typing import List, Optional
from chatbot.providers.llm_client import GEMINI_API_URL, GEMINI_API_KEY, _clean_json
from ocr.extraction.prompt import GEMINI_OCR_SYSTEM_PROMPT

logger = logging.getLogger("Medisync.OCR.Vision")

def extract_prescription(images_bytes: List[bytes], mime_type: str = "image/jpeg") -> Optional[dict]:
    """
    Calls Gemini Vision with the strict OCR prompt and one or multiple images.
    Gemini 1.5/2.5 supports multiple images in a single payload.
    """
    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY is missing")
        raise ValueError("GEMINI_API_KEY missing")

    url = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}"
    headers = {"Content-Type": "application/json"}
    
    parts = [{"text": GEMINI_OCR_SYSTEM_PROMPT}]
    
    for img_bytes in images_bytes:
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")
        parts.append({"inlineData": {"mimeType": mime_type, "data": img_b64}})
        
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.0, # Zero hallucination
            "maxOutputTokens": 2048, 
            "responseMimeType": "application/json"
        },
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=45)
        resp.raise_for_status()
        data = resp.json()
        raw_content = data["candidates"][0]["content"]["parts"][0]["text"]
        
        return json.loads(_clean_json(raw_content))
    except Exception as e:
        logger.error(f"Gemini Vision API error during OCR: {e}")
        return None
