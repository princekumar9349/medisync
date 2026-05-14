from typing import List

def parse_indian_shorthand(shorthand: str) -> List[str]:
    """
    Parses common Indian medical shorthands and translates them into an
    explicit list of schedule timings.
    Returns a list of timings (e.g. ['morning', 'night']) or an empty list if unknown.
    """
    s = shorthand.strip().upper()
    
    # 1. Map number-based schedules (e.g., 1-0-1)
    if "-" in s:
        parts = s.split("-")
        timings = []
        if len(parts) >= 3:
            if parts[0] != "0": timings.append("morning")
            if parts[1] != "0": timings.append("afternoon")
            if parts[2] != "0": timings.append("night")
        elif len(parts) == 2:
            if parts[0] != "0": timings.append("morning")
            if parts[1] != "0": timings.append("night")
        return timings

    # 2. Map standard abbreviations
    mapping = {
        "OD": ["morning"],
        "BID": ["morning", "night"],
        "BD": ["morning", "night"],
        "TID": ["morning", "afternoon", "night"],
        "TDS": ["morning", "afternoon", "night"],
        "QID": ["morning", "afternoon", "evening", "night"],
        "HS": ["night"],
        "SOS": ["as_needed"],
        "PRN": ["as_needed"],
        "STAT": ["immediate"]
    }
    
    # Check exact match
    if s in mapping:
        return mapping[s]
        
    # Check partial match for safety
    for key, val in mapping.items():
        if key in s:
            return val
            
    return []

def parse_meal_instructions(instruction: str) -> str:
    """
    Extracts common meal instructions (AF, BF).
    """
    inst = instruction.upper()
    if "AF" in inst or "AFTER FOOD" in inst or "PC" in inst:
        return "after_food"
    if "BF" in inst or "BEFORE FOOD" in inst or "AC" in inst:
        return "before_food"
    return "any_time"
