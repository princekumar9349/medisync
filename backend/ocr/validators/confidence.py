from typing import Dict, Any, List
import logging
from ocr.parsers.shorthand import parse_indian_shorthand, parse_meal_instructions

logger = logging.getLogger("Medisync.OCR.Validator")

def sanitize_and_validate_extraction(raw_extraction: dict) -> dict:
    """
    Takes raw Gemini output and cleans/validates it before it hits the DB/frontend.
    Adds parsed shorthand lists and sets flags for low confidence.
    Never lets raw data pass unchecked.
    """
    if not isinstance(raw_extraction, dict):
        logger.warning("Raw extraction is not a dict. Returning empty schema.")
        return _empty_extraction()
        
    overall_conf = raw_extraction.get("overall_confidence", 0.0)
    
    # Check if totally unreadable
    if overall_conf < 0.2:
        return _empty_extraction()

    medicines = raw_extraction.get("medicines", [])
    if not isinstance(medicines, list):
        medicines = []

    validated_medicines = []
    
    for med in medicines:
        name = med.get("name", "[UNREADABLE]")
        name_conf = med.get("name_confidence", 0.0)
        shorthand = med.get("shorthand", "")
        shorthand_conf = med.get("shorthand_confidence", 0.0)
        
        # If the medicine name itself is unreadable or has very low confidence, skip or flag it hard
        if "[UNREADABLE]" in str(name).upper() or name_conf < 0.3:
            needs_review = True
        else:
            needs_review = name_conf < 0.8 or shorthand_conf < 0.8
            
        # Parse shorthand securely
        inferred_timing = []
        if "[UNREADABLE]" not in str(shorthand).upper():
            inferred_timing = parse_indian_shorthand(str(shorthand))
            
        instructions = med.get("instructions", "")
        meal_instruction = parse_meal_instructions(str(instructions))
            
        validated_medicines.append({
            "name": name,
            "name_confidence": name_conf,
            "shorthand": shorthand,
            "shorthand_confidence": shorthand_conf,
            "duration": med.get("duration", ""),
            "duration_confidence": med.get("duration_confidence", 0.0),
            "instructions": instructions,
            "meal_instruction": meal_instruction,
            "inferred_timing": inferred_timing,
            "needs_review": needs_review
        })
        
    return {
        "overall_confidence": overall_conf,
        "medicines": validated_medicines
    }

def _empty_extraction() -> dict:
    return {
        "overall_confidence": 0.0,
        "medicines": []
    }
