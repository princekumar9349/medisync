"""
services/ocr_parser.py — Deterministic OCR parsing and cleaning.

Provides regex-based parsing and fuzzy string matching for medicine names
to extract structured data before falling back to LLM.
"""

import re
import logging
from typing import List, Dict, Any, Tuple
from thefuzz import process

logger = logging.getLogger("Medisync.OCR_Parser")

# ─── Comprehensive Indian Medicines Dictionary ────────────────────────────────
# Covers common Indian brand names, generics, and hospital discharge medicines
MEDICINE_DICTIONARY = [
    # Common generics
    "Paracetamol", "Amoxicillin", "Ibuprofen", "Cetirizine", "Azithromycin",
    "Pantoprazole", "Metformin", "Aspirin", "Omeprazole", "Atorvastatin",
    "Amlodipine", "Losartan", "Levothyroxine", "Ciprofloxacin", "Doxycycline",
    "Clindamycin", "Gabapentin", "Metoprolol", "Ondansetron", "Prednisone",
    "Amoxicillin Clavulanate", "Cefixime", "Cefpodoxime", "Ceftriaxone",
    "Diclofenac", "Ranitidine", "Domperidone", "Metoclopramide",
    "Hydrocortisone", "Betamethasone", "Dexamethasone", "Prednisolone",
    "Chlorpheniramine", "Loratadine", "Fexofenadine", "Montelukast",
    "Salbutamol", "Theophylline", "Budesonide", "Fluticasone",
    "Enalapril", "Ramipril", "Lisinopril", "Valsartan", "Telmisartan",
    "Glipizide", "Glibenclamide", "Voglibose", "Sitagliptin", "Teneligliptin",
    "Rosuvastatin", "Simvastatin", "Fenofibrate", "Gemfibrozil",
    "Warfarin", "Clopidogrel", "Aspirin", "Enoxaparin",
    "Tramadol", "Codeine", "Morphine", "Fentanyl",
    "Alprazolam", "Clonazepam", "Diazepam", "Lorazepam",
    "Sertraline", "Fluoxetine", "Escitalopram", "Paroxetine", "Venlafaxine",
    "Olanzapine", "Quetiapine", "Risperidone", "Haloperidol",
    "Carbamazepine", "Phenytoin", "Valproate", "Levetiracetam",
    "Metronidazole", "Tinidazole", "Fluconazole", "Itraconazole",
    "Acyclovir", "Oseltamivir",
    "Hydroxychloroquine", "Chloroquine",
    "Vitamin D3", "Vitamin B12", "Folic Acid", "Iron", "Calcium",
    "Zinc", "Multivitamin",
    
    # Common Indian brand names
    "Dolo", "Crocin", "Calpol", "Allegra", "Augmentin",
    "Crosin", "Panadol", "Combiflam", "Brufen",
    "Pan", "Pantop", "Pantocid", "Pantolock", "Pantaset",
    "Rantac", "Zinetac", "Aciloc",
    "Norflox", "Ciplox", "Cifran",
    "Taxim", "Monocef", "Ceftas",
    "Doxt", "Doxy", "Doxinate",
    "Montair", "Telekast", "Lukast",
    "Telma", "Telvas", "Telmikind",
    "Glycomet", "Glucophage", "Diamicron",
    "Januvia", "Galvus", "Zyloric",
    "Ecosprin", "Loprin", "Aspicot",
    "Clavix", "Plavix", "Clopilet",
    "Rosulip", "Crestor", "Rozavel",
    "Shelcal", "Calcirol", "Revital",
    "Limcee", "Becosules", "Zincovit",
    "ORS", "Electral", "Perinorm",
    "Avomine", "Stemetil", "Emeset",
    "Buscopan", "Meftal", "Mefenamic",
    
    # Hospital discharge / surgery medicines
    "Alphacin", "Alphacin CV",
    "Udiliv", "Ursodiol", "Ursodeoxycholic",
    "Chymoral", "Chymoral Plus", "Serratiopeptidase",
    "Upmune", "Immunace",
    "Livogen", "Ferinject", "Ferrous Sulphate",
    "Pantodac", "Razo", "Rabeprazole",
    "Seroflo", "Foracort", "Duolin",
    "Lasix", "Frusemide", "Furosemide",
    "Aldactone", "Spironolactone",
    "Digoxin", "Lanoxin",
    "Amiodarone", "Cordarone",
    "Nitroglycerin", "Isosorbide",
    "Atenolol", "Carvedilol", "Bisoprolol",
    "Sizodon", "Sizodon Plus", "Risperidone",
    "Qutipin", "Sertacleer", "Serta",
    "Ativan", "Rivotril", "Clonazepam",
    "Epilex", "Valproic", "Oxcarbazepine",
]

# Fuzzy match confidence threshold — lowered to catch more medicines
FUZZY_THRESHOLD = 70

# Tablet/capsule line detection prefixes
TABLET_PREFIXES = re.compile(
    r"^\s*(\(?[①②③④⑤⑥1-9]\)?\s*)?"   # circled numbers or plain
    r"(tab\.?|tablet\.?|cap\.?|capsule\.?|inj\.?|syp\.?|syr\.?|drops?\.?|td\.?|tw\.?)",
    re.IGNORECASE
)


def match_medicine(text_token: str) -> Tuple[str, int]:
    """Find the closest medicine match using fuzzy string matching."""
    if len(text_token) < 3:
        return None, 0
    match, score = process.extractOne(text_token, MEDICINE_DICTIONARY)
    return match, score


def extract_dosage(text: str) -> str:
    """Regex based dosage detection."""
    match = re.search(
        r"(\d+(?:\.\d+)?\s*(mg|ml|g|mcg|iu|tablet|tab|cap|capsule)s?)",
        text, re.IGNORECASE
    )
    if match:
        return match.group(1).lower()
    return ""


def extract_schedule(text: str) -> Dict[str, bool]:
    """
    Regex based schedule extraction mapping to standard booleans.
    Handles OD, BD, TDS, SOS, 1-0-1, morning/night, before/after food etc.
    """
    t = text.lower()

    schedule = {"morning": False, "afternoon": False, "night": False, "sos": False}

    # Pattern: 1-0-1, 1-1-1, 0-0-1 etc. (most reliable)
    num_pattern = re.search(r"([012])\s*[-/]\s*([012])\s*[-/]\s*([012])", t)
    if num_pattern:
        if int(num_pattern.group(1)) > 0: schedule["morning"] = True
        if int(num_pattern.group(2)) > 0: schedule["afternoon"] = True
        if int(num_pattern.group(3)) > 0: schedule["night"] = True
        return schedule

    # Medical abbreviations
    if any(w in t for w in ["tds", "t.i.d", "tid", "thrice", "three times", "three daily"]):
        schedule["morning"] = True
        schedule["afternoon"] = True
        schedule["night"] = True
    elif any(w in t for w in ["bd", "b.i.d", "bid", "twice", "two times", "twice daily"]):
        schedule["morning"] = True
        schedule["night"] = True
    elif any(w in t for w in ["od", "once daily", "once a day", "qd", "qod"]):
        schedule["morning"] = True
    elif any(w in t for w in ["morning", "breakfast", "hs morning"]):
        schedule["morning"] = True
    
    if any(w in t for w in ["night", "hs", "nocte", "bedtime", "at night", "1 night"]):
        schedule["night"] = True
    
    if any(w in t for w in ["afternoon", "lunch", "noon", "midday"]):
        schedule["afternoon"] = True

    if "sos" in t or "as needed" in t or "when required" in t:
        schedule["sos"] = True

    # Fallback: "x 1 night" pattern like "x - x - 1 night" 
    x_pattern = re.search(r"x\s*[-—]\s*x\s*[-—]\s*([12])", t)
    if x_pattern:
        schedule["night"] = True

    x2_pattern = re.search(r"([12])\s*[-—]\s*x\s*[-—]\s*([12])", t)
    if x2_pattern:
        schedule["morning"] = True
        schedule["night"] = True

    return schedule


def extract_duration(text: str) -> str:
    """Regex based duration detection."""
    # Handles "5 days", "BD X 5 DAYS", "x 10 days", etc.
    match = re.search(
        r"(?:x\s*)?(\d+)\s*(?:x\s*)?(days?|weeks?|months?)",
        text, re.IGNORECASE
    )
    if match:
        num  = match.group(1)
        unit = match.group(2).lower()
        if not unit.endswith("s"):
            unit += "s"
        return f"{num} {unit}"
    return ""


def _extract_medicine_name_from_line(line: str) -> str:
    """
    Strip Tab/Cap prefix and dosage suffix to isolate medicine name.
    E.g. 'Tab Alphacin CV 500mg BD X 5 DAYS' → 'Alphacin CV'
    """
    # Remove Tab/Cap/etc prefix
    cleaned = TABLET_PREFIXES.sub("", line).strip()
    # Remove dosage suffix (500mg, 40mg, etc.) and everything after
    cleaned = re.sub(r"\s+\d+(?:\.\d+)?\s*(mg|ml|g|mcg|iu).*", "", cleaned, flags=re.IGNORECASE)
    # Limit to first 3-4 words (medicine name rarely longer)
    words = cleaned.split()
    return " ".join(words[:4]).strip()


def parse_ocr_text(ocr_text: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Primary deterministic pipeline for parsing raw OCR text.

    Strategy:
      1. Identify lines that start with Tab/Cap/etc prefix → strong medicine candidates
      2. Fuzzy match medicine name against expanded dictionary
      3. Extract dosage, schedule, duration from the full line
      4. Collect unmatched lines as unknown_tokens for LLM fallback

    Returns:
        medicines: List of structured medicine dictionaries.
        unknown_tokens: List of strings that looked like medicines but failed matching.
    """
    lines = ocr_text.split('\n')
    medicines = []
    unknown_tokens = []
    seen_names = set()

    for line in lines:
        cleaned_line = line.strip()
        if not cleaned_line or len(cleaned_line) < 4:
            continue

        # Strip common Rx prefix
        if cleaned_line.lower().startswith('rx'):
            cleaned_line = cleaned_line[2:].strip()

        is_tablet_line = bool(TABLET_PREFIXES.match(cleaned_line))

        # ── Strategy A: Lines that start with Tab/Cap prefix ──────
        if is_tablet_line:
            med_name_candidate = _extract_medicine_name_from_line(cleaned_line)
            
            # Try full multi-word name first, then first word
            match, score = match_medicine(med_name_candidate)
            if score < FUZZY_THRESHOLD and " " in med_name_candidate:
                first_word = med_name_candidate.split()[0]
                m2, s2 = match_medicine(first_word)
                if s2 > score:
                    match, score = m2, s2

            if score >= FUZZY_THRESHOLD:
                if match in seen_names:
                    continue
                seen_names.add(match)
                dosage   = extract_dosage(cleaned_line)
                schedule = extract_schedule(cleaned_line)
                duration = extract_duration(cleaned_line)
                medicines.append({
                    "name": match,
                    "dosage": dosage,
                    "morning": schedule["morning"],
                    "afternoon": schedule["afternoon"],
                    "night": schedule["night"],
                    "sos": schedule["sos"],
                    "duration": duration,
                    "confidence": score,
                })
                logger.info(f"✅ Matched (Tab line): '{match}' score={score} from '{med_name_candidate}'")
            else:
                # Tab line but no dictionary match — definitely a medicine, send to LLM
                # Keep the cleaned name for better LLM context
                unknown_tokens.append(cleaned_line)
                logger.info(f"⚠️  Unmatched Tab line (score={score}): {cleaned_line[:60]}")
            continue

        # ── Strategy B: General lines — token-based matching ──────
        tokens = cleaned_line.split()
        if not tokens or len(tokens[0]) < 4:  # skip very short tokens
            continue

        potential_med = tokens[0]
        match, score = match_medicine(potential_med)

        if score < FUZZY_THRESHOLD and len(tokens) > 1:
            potential_med_2 = f"{tokens[0]} {tokens[1]}"
            match_2, score_2 = match_medicine(potential_med_2)
            if score_2 > score:
                match, score = match_2, score_2

        if score >= FUZZY_THRESHOLD:
            if match in seen_names:
                continue
            seen_names.add(match)
            dosage   = extract_dosage(cleaned_line)
            schedule = extract_schedule(cleaned_line)
            duration = extract_duration(cleaned_line)
            medicines.append({
                "name": match,
                "dosage": dosage,
                "morning": schedule["morning"],
                "afternoon": schedule["afternoon"],
                "night": schedule["night"],
                "sos": schedule["sos"],
                "duration": duration,
                "confidence": score,
            })
        else:
            if len(cleaned_line) > 5:
                unknown_tokens.append(cleaned_line)

    logger.info(
        f"📋 Parser found {len(medicines)} medicines, "
        f"{len(unknown_tokens)} unknown tokens for LLM fallback"
    )
    return medicines, unknown_tokens
