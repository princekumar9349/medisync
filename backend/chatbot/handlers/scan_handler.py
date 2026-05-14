import logging
from ..gateway.router import AIGateway
from ..prompts.templates import (
    _PROMPT_MEDICINES_FALLBACK,
    _PROMPT_INSIGHTS,
    _PROMPT_PRESCRIPTION_INTELLIGENCE,
    _PROMPT_SCAN_VISION
)

logger = logging.getLogger("Medisync.ScanHandler")

def fallback_parse_medicines(unknown_text: str) -> list:
    if not unknown_text.strip(): return []
    full_prompt = f"Raw Unmatched OCR Text:\n\n{unknown_text}"
    
    llm_resp = AIGateway.generate(
        system_prompt=_PROMPT_MEDICINES_FALLBACK,
        user_text=full_prompt,
        temperature=0.0,
        expect_json=True
    )
    
    if not isinstance(llm_resp, dict): return []
    raw_medicines = llm_resp.get("medicines", [])
    valid_medicines = []
    for med in raw_medicines:
        name = (med.get("name") or "").strip()
        if not name or len(name) < 2: continue
        med["confidence"] = 0.75
        valid_medicines.append(med)
    return valid_medicines

def parse_insights(ocr_text: str) -> dict:
    full_prompt = f"OCR Text from prescription:\n\n{ocr_text}"
    result = AIGateway.generate(
        system_prompt=_PROMPT_INSIGHTS,
        user_text=full_prompt,
        temperature=0.0,
        expect_json=True
    )
    return result if isinstance(result, dict) else {}

def analyze_prescription_deep(ocr_text: str) -> dict:
    full_prompt = f"Raw OCR Text from prescription:\n\n{ocr_text}"
    result = AIGateway.generate(
        system_prompt=_PROMPT_PRESCRIPTION_INTELLIGENCE,
        user_text=full_prompt,
        temperature=0.0,
        expect_json=True
    )
    return result if isinstance(result, dict) else {}

def scan_prescription_with_vision(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    result = AIGateway.generate(
        system_prompt=_PROMPT_SCAN_VISION,
        user_text="",
        temperature=0.0,
        expect_json=True,
        is_vision=True,
        image_bytes=image_bytes,
        mime_type=mime_type
    )
    return result if isinstance(result, dict) else {}
