"""
services/prescription_intelligence.py — Advanced Prescription Understanding for Medisync.

Provides:
  - analyze_prescription(): Full structured intelligence from OCR text
  - normalize_medicine_name(): Brand → generic pharmaceutical name
  - parse_timing(): Convert shorthand (1-0-1, BD, TDS) → readable schedule
  - detect_conditions(): Extract diseases/diagnoses from text
  - merge_patient_memory(): Accumulate memory across prescriptions
  - get_patient_memory(): Retrieve stored memory for chatbot context
"""

import re
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

from db import database

logger = logging.getLogger("Medisync.Intelligence")

# ─── Medicine Normalization Map ───────────────────────────────────────────────
# Brand name / abbreviation / OCR typo → (normalized_name, purpose)

MEDICINE_NORMALIZE: Dict[str, tuple] = {
    # Analgesics / Antipyretics
    "pcm": ("Paracetamol", "Fever / Pain relief"),
    "paracetamol": ("Paracetamol", "Fever / Pain relief"),
    "dolo": ("Paracetamol (Dolo)", "Fever / Pain relief"),
    "crocin": ("Paracetamol (Crocin)", "Fever / Pain relief"),
    "calpol": ("Paracetamol (Calpol)", "Fever / Pain relief"),
    "combiflam": ("Ibuprofen + Paracetamol (Combiflam)", "Pain / Inflammation"),
    "brufen": ("Ibuprofen (Brufen)", "Pain / Inflammation"),
    "ibuprofen": ("Ibuprofen", "Pain / Inflammation"),
    "meftal": ("Mefenamic Acid (Meftal)", "Pain relief"),
    "diclofenac": ("Diclofenac", "Pain / Inflammation"),
    "aspirin": ("Aspirin", "Pain / Blood thinner"),
    "ecosprin": ("Aspirin (Ecosprin)", "Blood thinner / Cardiac"),

    # Antibiotics
    "azee": ("Azithromycin", "Antibiotic"),
    "azithromycin": ("Azithromycin", "Antibiotic"),
    "augmentin": ("Amoxicillin + Clavulanate (Augmentin)", "Antibiotic"),
    "augmntin": ("Amoxicillin + Clavulanate (Augmentin)", "Antibiotic"),
    "amoxicillin": ("Amoxicillin", "Antibiotic"),
    "amoxyclav": ("Amoxicillin + Clavulanate", "Antibiotic"),
    "ciprofloxacin": ("Ciprofloxacin", "Antibiotic"),
    "ciplox": ("Ciprofloxacin (Ciplox)", "Antibiotic"),
    "cifran": ("Ciprofloxacin (Cifran)", "Antibiotic"),
    "norflox": ("Norfloxacin (Norflox)", "Antibiotic"),
    "doxycycline": ("Doxycycline", "Antibiotic"),
    "doxt": ("Doxycycline (Doxt)", "Antibiotic"),
    "cefixime": ("Cefixime", "Antibiotic"),
    "taxim": ("Cefixime (Taxim)", "Antibiotic"),
    "ceftriaxone": ("Ceftriaxone", "Antibiotic"),
    "monocef": ("Ceftriaxone (Monocef)", "Antibiotic"),
    "alphacin": ("Amoxicillin + Clavulanate (Alphacin)", "Antibiotic"),
    "alphacin cv": ("Amoxicillin + Clavulanate (Alphacin CV)", "Antibiotic"),
    "metronidazole": ("Metronidazole", "Antibiotic / Antiprotozoal"),
    "clindamycin": ("Clindamycin", "Antibiotic"),

    # Antacids / GI
    "pantocid": ("Pantoprazole", "Acid reflux / Gastric protection"),
    "pantop": ("Pantoprazole", "Acid reflux / Gastric protection"),
    "pantoprazole": ("Pantoprazole", "Acid reflux / Gastric protection"),
    "pan": ("Pantoprazole", "Acid reflux / Gastric protection"),
    "pantodac": ("Pantoprazole (Pantodac)", "Acid reflux"),
    "omeprazole": ("Omeprazole", "Acid reflux / GERD"),
    "ranitidine": ("Ranitidine", "Acid reflux"),
    "rantac": ("Ranitidine (Rantac)", "Acid reflux"),
    "rabeprazole": ("Rabeprazole", "Acid reflux"),
    "razo": ("Rabeprazole (Razo)", "Acid reflux"),
    "domperidone": ("Domperidone", "Nausea / Vomiting"),
    "perinorm": ("Metoclopramide (Perinorm)", "Nausea / Vomiting"),
    "ondansetron": ("Ondansetron", "Anti-emetic"),
    "emeset": ("Ondansetron (Emeset)", "Anti-emetic"),
    "udiliv": ("Ursodeoxycholic Acid (Udiliv)", "Liver protection"),

    # Antihistamines / Allergy
    "cetirizine": ("Cetirizine", "Allergy / Antihistamine"),
    "allegra": ("Fexofenadine (Allegra)", "Allergy / Antihistamine"),
    "fexofenadine": ("Fexofenadine", "Allergy / Antihistamine"),
    "loratadine": ("Loratadine", "Allergy / Antihistamine"),
    "chlorpheniramine": ("Chlorpheniramine", "Allergy / Antihistamine"),
    "montelukast": ("Montelukast", "Allergy / Asthma"),
    "montair": ("Montelukast (Montair)", "Allergy / Asthma"),

    # Cardiac / BP
    "amlodipine": ("Amlodipine", "Hypertension / Blood pressure"),
    "losartan": ("Losartan", "Hypertension / Blood pressure"),
    "telmisartan": ("Telmisartan", "Hypertension / Blood pressure"),
    "telma": ("Telmisartan (Telma)", "Hypertension"),
    "atenolol": ("Atenolol", "Hypertension / Heart rate"),
    "metoprolol": ("Metoprolol", "Hypertension / Heart rate"),
    "ramipril": ("Ramipril", "Hypertension / Cardiac"),
    "enalapril": ("Enalapril", "Hypertension"),
    "clopidogrel": ("Clopidogrel", "Blood thinner / Cardiac"),
    "clopilet": ("Clopidogrel (Clopilet)", "Blood thinner"),
    "atorvastatin": ("Atorvastatin", "Cholesterol / Lipid management"),
    "rosuvastatin": ("Rosuvastatin", "Cholesterol / Lipid management"),
    "rozavel": ("Rosuvastatin (Rozavel)", "Cholesterol"),

    # Diabetes
    "metformin": ("Metformin", "Diabetes / Blood sugar control"),
    "glycomet": ("Metformin (Glycomet)", "Diabetes"),
    "glipizide": ("Glipizide", "Diabetes"),
    "sitagliptin": ("Sitagliptin", "Diabetes"),
    "januvia": ("Sitagliptin (Januvia)", "Diabetes"),
    "teneligliptin": ("Teneligliptin", "Diabetes"),
    "voglibose": ("Voglibose", "Diabetes"),

    # Steroids
    "prednisolone": ("Prednisolone", "Anti-inflammatory / Steroid"),
    "prednisone": ("Prednisone", "Anti-inflammatory / Steroid"),
    "dexamethasone": ("Dexamethasone", "Anti-inflammatory / Steroid"),
    "hydrocortisone": ("Hydrocortisone", "Anti-inflammatory / Steroid"),

    # Respiratory
    "salbutamol": ("Salbutamol", "Bronchodilator / Asthma"),
    "budesonide": ("Budesonide", "Asthma / COPD"),
    "seroflo": ("Salmeterol + Fluticasone (Seroflo)", "Asthma"),
    "foracort": ("Formoterol + Budesonide (Foracort)", "Asthma"),
    "theophylline": ("Theophylline", "Asthma / COPD"),

    # Supplements
    "shelcal": ("Calcium + Vitamin D3 (Shelcal)", "Bone health"),
    "calcirol": ("Cholecalciferol (Calcirol)", "Vitamin D supplement"),
    "vitamin d3": ("Cholecalciferol (Vitamin D3)", "Vitamin D supplement"),
    "vitamin b12": ("Methylcobalamin (Vitamin B12)", "Nerve health"),
    "becosules": ("B-Complex (Becosules)", "Vitamin supplement"),
    "limcee": ("Ascorbic Acid (Limcee)", "Vitamin C supplement"),
    "zincovit": ("Multivitamin + Zinc (Zincovit)", "Nutritional supplement"),
    "folic acid": ("Folic Acid", "Blood formation / Pregnancy"),
    "iron": ("Ferrous Sulphate", "Iron supplement"),
    "livogen": ("Ferrous Fumarate + Folic Acid (Livogen)", "Iron supplement"),
    "revital": ("Multivitamin (Revital)", "General health"),

    # Enzymes / Surgical
    "chymoral": ("Trypsin + Chymotrypsin (Chymoral)", "Anti-inflammatory enzyme"),
    "chymoral plus": ("Trypsin + Chymotrypsin (Chymoral Plus)", "Anti-inflammatory enzyme"),
    "serratiopeptidase": ("Serratiopeptidase", "Anti-inflammatory enzyme"),

    # Neuro / Psych
    "gabapentin": ("Gabapentin", "Nerve pain / Epilepsy"),
    "escitalopram": ("Escitalopram", "Antidepressant / Anxiety"),
    "sertraline": ("Sertraline", "Antidepressant"),
    "alprazolam": ("Alprazolam", "Anxiety / Sedative"),
    "clonazepam": ("Clonazepam", "Anxiety / Seizures"),
    "levetiracetam": ("Levetiracetam", "Epilepsy / Seizures"),
    "carbamazepine": ("Carbamazepine", "Epilepsy / Nerve pain"),
    "phenytoin": ("Phenytoin", "Epilepsy"),
    "levothyroxine": ("Levothyroxine", "Thyroid hormone"),

    # Diuretics
    "lasix": ("Furosemide (Lasix)", "Diuretic / Edema"),
    "furosemide": ("Furosemide", "Diuretic"),

    # Miscellaneous
    "upmune": ("Immunomodulator (Upmune)", "Immune support"),
    "hydroxychloroquine": ("Hydroxychloroquine", "Autoimmune / Malaria"),
    "acyclovir": ("Acyclovir", "Antiviral"),
    "fluconazole": ("Fluconazole", "Antifungal"),
    "buscopan": ("Hyoscine Butylbromide (Buscopan)", "Abdominal cramps"),
    "ors": ("Oral Rehydration Salts", "Dehydration"),
    "electral": ("Oral Rehydration Salts (Electral)", "Dehydration"),
}

# ─── Medical Abbreviation → Condition Map ─────────────────────────────────────

CONDITION_ABBREVIATIONS: Dict[str, str] = {
    "uri": "Upper Respiratory Infection",
    "uti": "Urinary Tract Infection",
    "htn": "Hypertension",
    "dm": "Diabetes Mellitus",
    "dm2": "Type 2 Diabetes Mellitus",
    "t2dm": "Type 2 Diabetes Mellitus",
    "iddm": "Insulin Dependent Diabetes Mellitus",
    "copd": "Chronic Obstructive Pulmonary Disease",
    "cad": "Coronary Artery Disease",
    "mi": "Myocardial Infarction",
    "chf": "Congestive Heart Failure",
    "ckd": "Chronic Kidney Disease",
    "gerd": "Gastroesophageal Reflux Disease",
    "ibs": "Irritable Bowel Syndrome",
    "rti": "Respiratory Tract Infection",
    "lrti": "Lower Respiratory Tract Infection",
    "urti": "Upper Respiratory Tract Infection",
    "tb": "Tuberculosis",
    "acs": "Acute Coronary Syndrome",
    "dvt": "Deep Vein Thrombosis",
    "pe": "Pulmonary Embolism",
    "ra": "Rheumatoid Arthritis",
    "oa": "Osteoarthritis",
    "sle": "Systemic Lupus Erythematosus",
    "af": "Atrial Fibrillation",
    "bph": "Benign Prostatic Hyperplasia",
    "pcos": "Polycystic Ovary Syndrome",
    "ent": "Ear, Nose, Throat condition",
}

# ─── Symptom Keywords ─────────────────────────────────────────────────────────

SYMPTOM_KEYWORDS = [
    "fever", "cough", "cold", "headache", "body ache", "bodyache",
    "throat pain", "sore throat", "nausea", "vomiting", "diarrhea",
    "diarrhoea", "constipation", "acidity", "bloating", "gas",
    "chest pain", "breathlessness", "shortness of breath", "wheezing",
    "runny nose", "sneezing", "congestion", "fatigue", "weakness",
    "dizziness", "palpitations", "swelling", "edema", "rash",
    "itching", "burning", "pain", "abdominal pain", "back pain",
    "joint pain", "muscle pain", "insomnia", "anxiety", "loose motions",
    "weight loss", "weight gain", "loss of appetite", "bleeding",
    "urinary burning", "frequent urination", "blood pressure",
]

# ─── Test Keywords ────────────────────────────────────────────────────────────

TEST_KEYWORDS = [
    "cbc", "complete blood count", "blood test", "urine test",
    "x-ray", "xray", "ct scan", "mri", "ultrasound", "usg",
    "ecg", "ekg", "echo", "echocardiogram", "lipid profile",
    "thyroid profile", "tsh", "hba1c", "fasting blood sugar",
    "liver function", "lft", "kidney function", "kft", "rft",
    "creatinine", "uric acid", "esr", "crp", "rbs", "ppbs",
    "blood sugar", "sugar test", "stool test", "culture",
    "sensitivity", "biopsy", "endoscopy", "colonoscopy",
]


# ─── Schedule Parsing ─────────────────────────────────────────────────────────

def parse_timing(raw_timing: str) -> tuple:
    """
    Convert shorthand medical timing notation into human-readable schedule.

    Returns:
        (timing_interpreted: str, food_instruction: str)
    """
    if not raw_timing:
        return (None, None)

    t = raw_timing.strip().lower()
    interpreted = None
    food = None

    # Numeric patterns: 1-0-1, 1-1-1, 0-0-1
    num_match = re.search(r"([012])\s*[-/]\s*([012])\s*[-/]\s*([012])", t)
    if num_match:
        parts = []
        if int(num_match.group(1)) > 0: parts.append("morning")
        if int(num_match.group(2)) > 0: parts.append("afternoon")
        if int(num_match.group(3)) > 0: parts.append("night")
        interpreted = " + ".join(parts) if parts else "as directed"

    # Abbreviations
    if not interpreted:
        if any(w in t for w in ["tds", "t.i.d", "tid", "thrice"]):
            interpreted = "morning + afternoon + night"
        elif any(w in t for w in ["bd", "b.i.d", "bid", "twice"]):
            interpreted = "morning + night"
        elif "sos" in t:
            interpreted = "as needed"
        elif any(w in t for w in ["od", "once daily", "qd"]):
            interpreted = "once daily"
        elif any(w in t for w in ["hs", "bedtime", "before sleep"]):
            interpreted = "before sleep"
        elif "night" in t or "nocte" in t:
            interpreted = "night only"
        elif "morning" in t:
            interpreted = "morning only"

    # Food instructions
    if "ac" in t.split() or "before food" in t or "before meal" in t or "empty stomach" in t:
        food = "before food"
    elif "pc" in t.split() or "after food" in t or "after meal" in t or "with food" in t:
        food = "after food"

    return (interpreted, food)


# ─── Deterministic Extraction ─────────────────────────────────────────────────

def normalize_medicine_name(raw_name: str) -> tuple:
    """
    Normalize a raw medicine name to its pharmaceutical name + purpose.

    Returns:
        (normalized_name, purpose, confidence)
    """
    if not raw_name:
        return (None, None, "low")

    key = raw_name.strip().lower()
    # Remove common prefixes
    for prefix in ["tab ", "tab. ", "tablet ", "cap ", "cap. ", "capsule ",
                    "inj ", "inj. ", "syp ", "syr ", "drops "]:
        if key.startswith(prefix):
            key = key[len(prefix):].strip()

    # Direct lookup
    if key in MEDICINE_NORMALIZE:
        norm, purpose = MEDICINE_NORMALIZE[key]
        return (norm, purpose, "high")

    # Try without trailing numbers/dosage
    clean_key = re.sub(r"\s*\d+\s*(mg|ml|g|mcg|iu)?\s*$", "", key).strip()
    if clean_key in MEDICINE_NORMALIZE:
        norm, purpose = MEDICINE_NORMALIZE[clean_key]
        return (norm, purpose, "high")

    # Partial match — first word
    first_word = key.split()[0] if key.split() else key
    if first_word in MEDICINE_NORMALIZE:
        norm, purpose = MEDICINE_NORMALIZE[first_word]
        return (norm, purpose, "medium")

    return (None, None, "low")


def detect_conditions(ocr_text: str) -> List[str]:
    """Extract probable conditions/diagnoses from OCR text using abbreviation map."""
    conditions = []
    text_lower = ocr_text.lower()
    words = re.findall(r"\b[a-z0-9]+\b", text_lower)

    for word in words:
        if word in CONDITION_ABBREVIATIONS:
            full_name = CONDITION_ABBREVIATIONS[word]
            if full_name not in conditions:
                conditions.append(full_name)

    # Also check multi-word conditions
    for phrase, full_name in [
        ("upper respiratory", "Upper Respiratory Infection"),
        ("lower respiratory", "Lower Respiratory Tract Infection"),
        ("urinary tract", "Urinary Tract Infection"),
        ("blood pressure", "Hypertension"),
        ("high bp", "Hypertension"),
        ("sugar patient", "Diabetes Mellitus"),
        ("acid reflux", "Gastroesophageal Reflux Disease"),
        ("chest infection", "Lower Respiratory Tract Infection"),
        ("viral fever", "Viral Fever"),
        ("typhoid", "Typhoid Fever"),
        ("dengue", "Dengue Fever"),
        ("malaria", "Malaria"),
        ("pneumonia", "Pneumonia"),
        ("bronchitis", "Bronchitis"),
        ("sinusitis", "Sinusitis"),
        ("tonsillitis", "Tonsillitis"),
        ("gastritis", "Gastritis"),
        ("anemia", "Anemia"),
        ("anaemia", "Anemia"),
    ]:
        if phrase in text_lower and full_name not in conditions:
            conditions.append(full_name)

    return conditions


def detect_symptoms(ocr_text: str) -> List[str]:
    """Extract symptoms mentioned in OCR text."""
    found = []
    text_lower = ocr_text.lower()
    for symptom in SYMPTOM_KEYWORDS:
        if symptom in text_lower and symptom not in found:
            found.append(symptom)
    return found


def detect_tests(ocr_text: str) -> List[str]:
    """Extract recommended tests from OCR text."""
    found = []
    text_lower = ocr_text.lower()
    for test in TEST_KEYWORDS:
        if test in text_lower and test not in found:
            found.append(test)
    return found


def build_deterministic_medicines(det_medicines: list) -> list:
    """
    Take deterministic parser output and enrich with normalization + timing.

    Args:
        det_medicines: List of dicts from ocr_parser.parse_ocr_text()

    Returns:
        List of PrescriptionMedicineDetail-compatible dicts
    """
    enriched = []
    for m in det_medicines:
        raw_name = m.get("name", "")
        norm_name, purpose, conf = normalize_medicine_name(raw_name)

        # Build timing_raw from boolean schedule
        timing_parts = []
        if m.get("morning"): timing_parts.append("1")
        else: timing_parts.append("0")
        if m.get("afternoon"): timing_parts.append("1")
        else: timing_parts.append("0")
        if m.get("night"): timing_parts.append("1")
        else: timing_parts.append("0")
        timing_raw = "-".join(timing_parts)
        if m.get("sos"):
            timing_raw = "SOS"

        timing_interpreted, food_instruction = parse_timing(timing_raw)

        # If no timing was parsed, try to build from booleans
        if not timing_interpreted:
            slots = []
            if m.get("morning"): slots.append("morning")
            if m.get("afternoon"): slots.append("afternoon")
            if m.get("night"): slots.append("night")
            if slots:
                timing_interpreted = " + ".join(slots)
            elif m.get("sos"):
                timing_interpreted = "as needed"

        # Confidence mapping
        det_score = float(m.get("confidence", 0))
        if det_score >= 85:
            confidence = "high"
        elif det_score >= 70:
            confidence = "medium"
        else:
            confidence = "low"
        # If we couldn't normalize, lower confidence
        if conf == "low" and confidence == "high":
            confidence = "medium"

        enriched.append({
            "name": raw_name,
            "normalized_name": norm_name or raw_name,
            "dosage": m.get("dosage", None),
            "timing_raw": timing_raw,
            "timing_interpreted": timing_interpreted,
            "duration": m.get("duration", None) or None,
            "food_instruction": food_instruction,
            "purpose": purpose,
            "confidence": confidence,
        })

    return enriched


# ─── Patient Memory Accumulation ──────────────────────────────────────────────

def merge_patient_memory(
    user_id: str,
    new_conditions: List[str],
    new_medicines: List[str],
    new_symptoms: List[str],
    new_risks: List[str],
    new_notes: List[str],
) -> dict:
    """
    Merge new prescription data into existing patient memory.

    Rules:
      - No duplicates
      - Preserve all historical medicine records
      - Update active conditions intelligently
      - Add timestamp to each scan entry
    """
    memory_col = database.get_patient_memory()
    if memory_col is None:
        logger.warning("MongoDB unavailable — returning transient memory only.")
        return {
            "active_conditions": new_conditions,
            "chronic_conditions": [],
            "medicine_history": new_medicines,
            "allergies": [],
            "health_risks": new_risks,
            "important_notes": new_notes,
        }

    # Fetch existing memory
    existing = memory_col.find_one({"user_id": user_id}) or {}

    # Merge lists without duplicates (case-insensitive)
    def merge_unique(old: list, new: list) -> list:
        combined = list(old)
        existing_lower = {item.lower() for item in combined}
        for item in new:
            if item and item.lower() not in existing_lower:
                combined.append(item)
                existing_lower.add(item.lower())
        return combined

    merged = {
        "user_id": user_id,
        "active_conditions": merge_unique(
            existing.get("active_conditions", []), new_conditions
        ),
        "chronic_conditions": existing.get("chronic_conditions", []),
        "medicine_history": merge_unique(
            existing.get("medicine_history", []), new_medicines
        ),
        "allergies": existing.get("allergies", []),
        "health_risks": merge_unique(
            existing.get("health_risks", []), new_risks
        ),
        "important_notes": merge_unique(
            existing.get("important_notes", []), new_notes
        ),
        "last_updated": datetime.utcnow(),
        "scan_count": existing.get("scan_count", 0) + 1,
    }

    # Detect chronic conditions: if a condition appears across 2+ scans
    condition_history = existing.get("_condition_history", {})
    for cond in new_conditions:
        cond_key = cond.lower()
        condition_history[cond_key] = condition_history.get(cond_key, 0) + 1
        if condition_history[cond_key] >= 2 and cond not in merged["chronic_conditions"]:
            merged["chronic_conditions"].append(cond)
    merged["_condition_history"] = condition_history

    # Persist
    try:
        memory_col.update_one(
            {"user_id": user_id},
            {"$set": merged},
            upsert=True,
        )
        logger.info(f"🧠 Patient memory updated for user {user_id[:8]}... (scan #{merged['scan_count']})")
    except Exception as e:
        logger.error(f"Failed to persist patient memory: {e}")

    # Return clean memory (without internal tracking fields)
    return {
        "active_conditions": merged["active_conditions"],
        "chronic_conditions": merged["chronic_conditions"],
        "medicine_history": merged["medicine_history"],
        "allergies": merged["allergies"],
        "health_risks": merged["health_risks"],
        "important_notes": merged["important_notes"],
    }


def get_patient_memory_for_chat(user_id: str) -> dict:
    """
    Retrieve the accumulated patient memory for chatbot context.

    Returns a dict suitable for injection into chatbot system prompt.
    """
    memory_col = database.get_patient_memory()
    if memory_col is None:
        return {}

    doc = memory_col.find_one({"user_id": user_id}, {"_id": 0, "_condition_history": 0})
    return doc or {}


# ─── Audit / Intelligence Storage ─────────────────────────────────────────────

def save_scan_intelligence(user_id: Optional[str], raw_ocr: str, structured_response: dict) -> None:
    """
    Persist both raw OCR text and final structured JSON for auditability.
    """
    intel_col = database.get_scan_intelligence()
    if intel_col is None:
        return

    doc = {
        "user_id": user_id,
        "raw_ocr_text": raw_ocr,
        "structured_result": structured_response,
        "scanned_at": datetime.utcnow(),
    }

    try:
        intel_col.insert_one(doc)
        user_disp = user_id[:8] if user_id else "anonymous"
        logger.info(f"📄 Scan intelligence saved for user {user_disp}")
    except Exception as e:
        logger.error(f"Failed to save scan intelligence: {e}")
