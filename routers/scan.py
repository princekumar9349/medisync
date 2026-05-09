"""
routers/scan.py — Prescription scanning endpoint for Medisync.

Routes:
  POST /scan — Upload prescription image, extract medicines via Hybrid Pipeline (PaddleOCR + Regex/Fuzzy + LLM Fallback)

Auth: OPTIONAL — if a valid JWT token is present, the prescription is
linked to the user. Without a token it is saved as anonymous (user_id=None).
"""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile, Depends, status

from db import database
from models.schemas import Medicine, ScanResponse, TokenData
from services.auth_service import get_optional_user
from services.ocr_service import run_ocr
from services.ocr_parser import parse_ocr_text
from services.llm_service import fallback_parse_medicines, parse_insights, calculate_expiry

logger = logging.getLogger("Medisync.Scan")
router = APIRouter(tags=["Prescription"])


@router.post(
    "/scan",
    response_model=ScanResponse,
    summary="Scan a prescription image using Hybrid Pipeline",
)
async def scan_prescription(
    file: UploadFile = File(...),
    current_user: Optional[TokenData] = Depends(get_optional_user),
):
    """
    Hybrid prescription processing pipeline:

    1. Read uploaded image bytes
    2. PaddleOCR → extract raw text, confidence score, bounding boxes
    3. Deterministic Parser (Regex + Fuzzy Matching) → extract standard medicines
    4. LLM Fallback (Groq) → ONLY for unknown tokens, validates against dictionary
    5. Groq LLM call → extract clinical insights (condition, advice)
    6. Return unified ScanResponse JSON
    """
    try:
        # ── 1. Read image ─────────────────────────────────────────
        image_bytes = await file.read()

        if not image_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty.",
            )

        if not _is_valid_image_bytes(image_bytes):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file type. Please upload a JPEG, PNG, or BMP image.",
            )

        # ── 2. PaddleOCR ─────────────────────────────────────────
        try:
            ocr_text, confidence_score, raw_bboxes = run_ocr(image_bytes)
        except ValueError as ve:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))

        # ── 3. Deterministic Parser ───────────────────────────────
        det_medicines, unknown_tokens = parse_ocr_text(ocr_text)
        
        # ── 4. LLM Fallback ───────────────────────────────────────
        final_medicines_data = list(det_medicines)
        if unknown_tokens:
            unknown_text = " ".join(unknown_tokens)
            fallback_meds = fallback_parse_medicines(unknown_text)
            final_medicines_data.extend(fallback_meds)

        # ── 5. LLM Insights ───────────────────────────────────────
        insight_data = parse_insights(ocr_text)

        # ── 6. Normalize + Enrich medicines ─────────────────────
        parsed_medicines = []
        global_schedule = set()

        for m in final_medicines_data:
            expiry = calculate_expiry(m.get("duration", ""))
            
            # Re-construct backwards-compatible schedule list
            sched_list = []
            if m.get("morning"): sched_list.append("morning")
            if m.get("afternoon"): sched_list.append("afternoon")
            if m.get("night"): sched_list.append("night")
            
            # Map 'sos' to 'night' or just empty if we want to be strict, but let's keep it simple
            if m.get("sos") and not sched_list:
                sched_list = []

            med = Medicine(
                name=m.get("name", ""),
                dosage=m.get("dosage", ""),
                morning=bool(m.get("morning")),
                afternoon=bool(m.get("afternoon")),
                night=bool(m.get("night")),
                sos=bool(m.get("sos")),
                duration=m.get("duration", ""),
                schedule=sched_list,
                expiry_date=expiry,
                confidence=float(m.get("confidence", 0.0))
            )
            parsed_medicines.append(med)
            global_schedule.update(sched_list)

        # ── 7. Build response object ──────────────────────────────
        response = ScanResponse(
            ocr_text=ocr_text,
            confidence_score=confidence_score,
            medicines=parsed_medicines,
            schedule=sorted(global_schedule, key=lambda x: ["morning", "afternoon", "night"].index(x) if x in ["morning", "afternoon", "night"] else 99),
            doctor_advice=insight_data.get("doctor_advice", "No specific advice noted."),
            possible_condition=insight_data.get("possible_condition", "Not determined"),
            precautions=insight_data.get("precautions", "Follow standard prescription guidelines."),
            unmatched_tokens=unknown_tokens
        )

        # ── 8. Persist to MongoDB ─────────────────────────────────
        prescriptions_col = database.get_prescriptions()
        if prescriptions_col is not None:
            try:
                doc = response.model_dump()
                doc["created_at"] = datetime.utcnow()
                # store raw bounding boxes in DB (not returned in API to save bandwidth unless requested)
                doc["raw_bounding_boxes"] = raw_bboxes
                doc["user_id"] = current_user.user_id if current_user else None
                prescriptions_col.insert_one(doc)
                user_disp = current_user.user_id[:8] if current_user and current_user.user_id else 'anonymous'
                logger.info(f"💾 Prescription saved — user: {user_disp}...")
            except Exception as db_err:
                logger.warning(f"Could not persist prescription: {db_err}")

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Scan error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during prescription processing.",
        )


# ─── Helper ───────────────────────────────────────────────────────────────────

def _is_valid_image_bytes(data: bytes) -> bool:
    """Quick magic-byte check for common image formats."""
    if data[:3] == b"\xff\xd8\xff":
        return True   # JPEG
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return True   # PNG
    if data[:2] in (b"BM",):
        return True   # BMP
    if data[:4] in (b"II*\x00", b"MM\x00*"):
        return True   # TIFF
    return False


# ═══════════════════════════════════════════════════════════════════════════════
#  POST /scan/analyze — Advanced Prescription Intelligence Pipeline
# ═══════════════════════════════════════════════════════════════════════════════

from models.schemas import (
    PrescriptionIntelligenceResponse,
    PrescriptionMedicineDetail,
    PatientSummary,
    PatientMemory,
)
from services.llm_service import analyze_prescription_deep
from services.prescription_intelligence import (
    build_deterministic_medicines,
    detect_conditions,
    detect_symptoms,
    detect_tests,
    merge_patient_memory,
    save_scan_intelligence,
)


def _merge_llm_into_deterministic(det_meds: list, llm_meds: list) -> list:
    """
    Merge LLM-extracted medicines into deterministic results.

    Rules:
      - Deterministic results always take priority (higher trust)
      - LLM medicines are added only if not already present
      - LLM-only medicines are marked with confidence = "low"
    """
    # Build set of names already found deterministically
    det_names = {m.get("name", "").lower() for m in det_meds}
    det_norm = {(m.get("normalized_name") or "").lower() for m in det_meds}

    merged = list(det_meds)

    for llm_med in llm_meds:
        llm_name = (llm_med.get("name") or "").lower()
        llm_norm = (llm_med.get("normalized_name") or "").lower()

        # Skip if already captured deterministically
        if llm_name in det_names or llm_norm in det_norm:
            continue
        if llm_name in det_norm or llm_norm in det_names:
            continue

        # LLM-only medicine — mark confidence conservatively
        if llm_med.get("confidence") not in ("low",):
            llm_med["confidence"] = "medium"

        merged.append(llm_med)

    return merged


def _merge_lists_unique(primary: list, secondary: list) -> list:
    """Merge two lists, removing case-insensitive duplicates. Primary takes priority."""
    seen = {item.lower() for item in primary if isinstance(item, str)}
    result = list(primary)
    for item in secondary:
        if isinstance(item, str) and item.lower() not in seen:
            result.append(item)
            seen.add(item.lower())
    return result


@router.post(
    "/scan/analyze",
    response_model=PrescriptionIntelligenceResponse,
    summary="Advanced prescription intelligence analysis",
)
async def analyze_prescription(
    file: UploadFile = File(...),
    current_user: Optional[TokenData] = Depends(get_optional_user),
):
    """
    Advanced prescription intelligence pipeline:

    1. PaddleOCR → extract raw text
    2. Deterministic Parser (Regex + Fuzzy + Normalization) → structured medicines
    3. Deterministic detectors → conditions, symptoms, tests
    4. LLM Enrichment (Groq) → fill gaps, infer diseases, generate advice
    5. Merge deterministic + LLM results (deterministic takes priority)
    6. Accumulate patient memory in MongoDB
    7. Store raw OCR + structured JSON for auditability
    8. Return full PrescriptionIntelligenceResponse
    """
    try:
        # ── 1. Read image ─────────────────────────────────────────
        image_bytes = await file.read()

        if not image_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty.",
            )

        if not _is_valid_image_bytes(image_bytes):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file type. Please upload a JPEG, PNG, or BMP image.",
            )

        # ── 2. PaddleOCR ─────────────────────────────────────────
        try:
            ocr_text, confidence_score, _ = run_ocr(image_bytes)
        except ValueError as ve:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))

        logger.info(f"🔬 /scan/analyze — OCR extracted {len(ocr_text)} chars, confidence={confidence_score:.2f}")

        # ── 3. Deterministic extraction ───────────────────────────
        det_medicines_raw, unknown_tokens = parse_ocr_text(ocr_text)
        det_medicines = build_deterministic_medicines(det_medicines_raw)
        det_conditions = detect_conditions(ocr_text)
        det_symptoms = detect_symptoms(ocr_text)
        det_tests = detect_tests(ocr_text)

        logger.info(
            f"📋 Deterministic: {len(det_medicines)} meds, "
            f"{len(det_conditions)} conditions, {len(det_symptoms)} symptoms"
        )

        # ── 4. LLM enrichment ────────────────────────────────────
        llm_result = analyze_prescription_deep(ocr_text)

        # Extract LLM components (gracefully handle missing keys)
        llm_meds = llm_result.get("medicines", [])
        llm_summary = llm_result.get("patient_summary", {})
        llm_tests = llm_result.get("tests_recommended", []) or []
        llm_notes = llm_result.get("doctor_notes", []) or []
        llm_memory = llm_result.get("patient_memory", {})

        # ── 5. Merge: deterministic takes priority ────────────────
        final_medicines = _merge_llm_into_deterministic(det_medicines, llm_meds)

        final_conditions = _merge_lists_unique(
            det_conditions,
            llm_summary.get("probable_conditions", [])
        )
        final_symptoms = _merge_lists_unique(
            det_symptoms,
            llm_summary.get("symptoms", [])
        )
        final_tests = _merge_lists_unique(det_tests, llm_tests)
        final_advice = llm_summary.get("medical_advice", []) or []
        final_follow_up = llm_summary.get("follow_up") or None
        final_risks = llm_summary.get("risk_flags", []) or []
        final_notes = llm_notes

        # ── 6. Build response ─────────────────────────────────────
        medicine_details = [
            PrescriptionMedicineDetail(**m) for m in final_medicines
        ]

        patient_summary = PatientSummary(
            probable_conditions=final_conditions,
            symptoms=final_symptoms,
            medical_advice=final_advice,
            follow_up=final_follow_up,
            risk_flags=final_risks,
        )

        # ── 7. Accumulate patient memory ──────────────────────────
        medicine_names = [
            m.get("normalized_name") or m.get("name", "")
            for m in final_medicines
            if m.get("name")
        ]

        user_id = current_user.user_id if current_user else None

        if user_id:
            memory_dict = merge_patient_memory(
                user_id=user_id,
                new_conditions=final_conditions,
                new_medicines=medicine_names,
                new_symptoms=final_symptoms,
                new_risks=final_risks,
                new_notes=final_notes + [
                    f"Prescription scanned on {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}"
                ],
            )
        else:
            # Anonymous scan — build transient memory from LLM
            memory_dict = llm_memory or {
                "active_conditions": final_conditions,
                "chronic_conditions": [],
                "medicine_history": medicine_names,
                "allergies": [],
                "health_risks": final_risks,
                "important_notes": [],
            }

        patient_memory = PatientMemory(**{
            k: v for k, v in memory_dict.items()
            if k in PatientMemory.model_fields
        })

        response = PrescriptionIntelligenceResponse(
            patient_summary=patient_summary,
            medicines=medicine_details,
            tests_recommended=final_tests,
            doctor_notes=final_notes,
            patient_memory=patient_memory,
            raw_ocr_text=ocr_text,
            ocr_confidence=confidence_score,
        )

        # ── 8. Audit: store raw + structured ──────────────────────
        save_scan_intelligence(
            user_id=user_id,
            raw_ocr=ocr_text,
            structured_response=response.model_dump(mode="json"),
        )

        logger.info(
            f"✅ /scan/analyze complete — {len(medicine_details)} medicines, "
            f"{len(final_conditions)} conditions"
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ /scan/analyze error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during advanced prescription analysis.",
        )
