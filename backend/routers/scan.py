"""
routers/scan.py — Prescription scanning endpoint for Medisync.

Routes:
  POST /scan         — Scan prescription via Gemini Vision AI (primary)
  POST /scan/analyze — Advanced intelligence with patient memory accumulation

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
from services.llm_service import scan_prescription_with_vision, calculate_expiry

logger = logging.getLogger("Medisync.Scan")
router = APIRouter(tags=["Prescription"])


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


def _detect_mime_type(data: bytes) -> str:
    """Detect MIME type from image magic bytes."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:2] == b"BM":
        return "image/bmp"
    if data[:4] in (b"II*\x00", b"MM\x00*"):
        return "image/tiff"
    return "image/jpeg"  # fallback


# ═══════════════════════════════════════════════════════════════════════════════
#  POST /scan — Gemini Vision Prescription Scanner
# ═══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/scan",
    response_model=ScanResponse,
    summary="Scan a prescription image using Gemini Vision AI",
)
async def scan_prescription(
    file: UploadFile = File(...),
    current_user: Optional[TokenData] = Depends(get_optional_user),
):
    """
    Gemini Vision prescription scanning pipeline:

    1. Read uploaded image bytes
    2. Send image directly to Gemini Vision API
    3. Gemini reads the prescription and extracts all medicines, dosages, schedules
    4. Build ScanResponse with medicines + insights
    5. Persist to MongoDB
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

        # ── 2. Gemini Vision — read prescription directly ─────────
        mime_type = _detect_mime_type(image_bytes)
        logger.info(f"📸 Scanning prescription with Gemini Vision ({mime_type})...")

        gemini_result = scan_prescription_with_vision(image_bytes, mime_type)

        if not gemini_result or not gemini_result.get("medicines"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not extract any medicines from the prescription image. Please try a clearer photo.",
            )

        # ── 3. Build medicines from Gemini response ───────────────
        parsed_medicines = []
        global_schedule = set()

        for m in gemini_result.get("medicines", []):
            # Parse timing to booleans for backward compatibility
            timing = (m.get("timing_interpreted") or "").lower()
            morning = "morning" in timing
            afternoon = "afternoon" in timing
            night = "night" in timing
            sos = "as needed" in timing or "sos" in (m.get("timing_raw") or "").lower()

            # If no timing parsed, try timing_raw
            if not (morning or afternoon or night or sos):
                raw = (m.get("timing_raw") or "").lower()
                if "1-0-1" in raw or "bd" in raw:
                    morning, night = True, True
                elif "1-1-1" in raw or "tds" in raw:
                    morning, afternoon, night = True, True, True
                elif "0-0-1" in raw:
                    night = True
                elif "od" in raw:
                    morning = True
                elif "sos" in raw:
                    sos = True

            sched_list = []
            if morning: sched_list.append("morning")
            if afternoon: sched_list.append("afternoon")
            if night: sched_list.append("night")

            duration = m.get("duration") or ""
            expiry = calculate_expiry(duration) if duration else None

            med = Medicine(
                name=m.get("normalized_name") or m.get("name") or "",
                dosage=m.get("dosage") or "",
                morning=morning,
                afternoon=afternoon,
                night=night,
                sos=sos,
                duration=duration,
                schedule=sched_list,
                expiry_date=expiry,
                confidence=_confidence_to_float(m.get("confidence", "medium")),
            )
            parsed_medicines.append(med)
            global_schedule.update(sched_list)

        # ── 4. Extract insights from Gemini response ──────────────
        patient_summary = gemini_result.get("patient_summary", {})
        doctor_notes = gemini_result.get("doctor_notes", [])

        advice_parts = []
        if patient_summary.get("medical_advice"):
            advice_parts.extend(patient_summary["medical_advice"])
        if doctor_notes:
            advice_parts.extend(doctor_notes)

        # ── 5. Build response ─────────────────────────────────────
        response = ScanResponse(
            ocr_text="[Gemini Vision — direct image analysis]",
            confidence_score=0.90,
            medicines=parsed_medicines,
            schedule=sorted(
                global_schedule,
                key=lambda x: ["morning", "afternoon", "night"].index(x)
                if x in ["morning", "afternoon", "night"] else 99,
            ),
            doctor_advice="; ".join(advice_parts) if advice_parts else "Follow prescription as directed.",
            possible_condition=", ".join(patient_summary.get("probable_conditions", [])) or "Not determined",
            precautions="; ".join(patient_summary.get("risk_flags", [])) or "Follow standard prescription guidelines.",
        )

        # ── 6. Persist to MongoDB ─────────────────────────────────
        prescriptions_col = database.get_prescriptions()
        if prescriptions_col is not None:
            try:
                doc = response.model_dump()
                doc["created_at"] = datetime.utcnow()
                doc["user_id"] = current_user.user_id if current_user else None
                doc["gemini_raw_response"] = gemini_result
                prescriptions_col.insert_one(doc)
                user_disp = current_user.user_id[:8] if current_user and current_user.user_id else "anonymous"
                logger.info(f" Prescription saved — user: {user_disp}...")
            except Exception as db_err:
                logger.warning(f"Could not persist prescription: {db_err}")

        logger.info(f"Scan complete — {len(parsed_medicines)} medicines extracted via Gemini Vision")
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Scan error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during prescription processing.",
        )


def _confidence_to_float(conf: str) -> float:
    """Convert string confidence to float for backward compatibility."""
    mapping = {"high": 0.95, "medium": 0.75, "low": 0.50}
    return mapping.get((conf or "").lower(), 0.75)


# ═══════════════════════════════════════════════════════════════════════════════
#  POST /scan/analyze — Advanced Prescription Intelligence Pipeline
# ═══════════════════════════════════════════════════════════════════════════════

from models.schemas import (
    PrescriptionIntelligenceResponse,
    PrescriptionMedicineDetail,
    PatientSummary,
    PatientMemory,
)
from services.prescription_intelligence import (
    merge_patient_memory,
    save_scan_intelligence,
)


@router.post(
    "/scan/analyze",
    response_model=PrescriptionIntelligenceResponse,
    summary="Advanced prescription intelligence with patient memory",
)
async def analyze_prescription(
    file: UploadFile = File(...),
    current_user: Optional[TokenData] = Depends(get_optional_user),
):
    """
    Advanced prescription intelligence pipeline (Gemini Vision):

    1. Send image directly to Gemini Vision
    2. Extract medicines, conditions, symptoms, advice
    3. Accumulate patient memory in MongoDB
    4. Store raw + structured data for auditability
    5. Return full PrescriptionIntelligenceResponse
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

        # ── 2. Gemini Vision ──────────────────────────────────────
        mime_type = _detect_mime_type(image_bytes)
        logger.info(f"🔬 /scan/analyze — Gemini Vision ({mime_type})...")

        gemini_result = scan_prescription_with_vision(image_bytes, mime_type)

        if not gemini_result:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not analyze the prescription. Please try a clearer photo.",
            )

        # ── 3. Build structured response ──────────────────────────
        llm_meds = gemini_result.get("medicines", [])
        llm_summary = gemini_result.get("patient_summary", {})
        llm_tests = gemini_result.get("tests_recommended", []) or []
        llm_notes = gemini_result.get("doctor_notes", []) or []
        llm_memory = gemini_result.get("patient_memory", {})

        medicine_details = [
            PrescriptionMedicineDetail(**m) for m in llm_meds
        ]

        patient_summary = PatientSummary(
            probable_conditions=llm_summary.get("probable_conditions", []),
            symptoms=llm_summary.get("symptoms", []),
            medical_advice=llm_summary.get("medical_advice", []),
            follow_up=llm_summary.get("follow_up"),
            risk_flags=llm_summary.get("risk_flags", []),
        )

        # ── 4. Accumulate patient memory ──────────────────────────
        medicine_names = [
            m.get("normalized_name") or m.get("name", "")
            for m in llm_meds if m.get("name")
        ]

        user_id = current_user.user_id if current_user else None

        if user_id:
            memory_dict = merge_patient_memory(
                user_id=user_id,
                new_conditions=llm_summary.get("probable_conditions", []),
                new_medicines=medicine_names,
                new_symptoms=llm_summary.get("symptoms", []),
                new_risks=llm_summary.get("risk_flags", []),
                new_notes=llm_notes + [
                    f"Prescription scanned on {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}"
                ],
            )
        else:
            memory_dict = llm_memory or {
                "active_conditions": llm_summary.get("probable_conditions", []),
                "chronic_conditions": [],
                "medicine_history": medicine_names,
                "allergies": [],
                "health_risks": llm_summary.get("risk_flags", []),
                "important_notes": [],
            }

        patient_memory = PatientMemory(**{
            k: v for k, v in memory_dict.items()
            if k in PatientMemory.model_fields
        })

        response = PrescriptionIntelligenceResponse(
            patient_summary=patient_summary,
            medicines=medicine_details,
            tests_recommended=llm_tests,
            doctor_notes=llm_notes,
            patient_memory=patient_memory,
            raw_ocr_text="[Gemini Vision — direct image analysis]",
            ocr_confidence=0.90,
        )

        # ── 5. Audit: store structured result ─────────────────────
        save_scan_intelligence(
            user_id=user_id,
            raw_ocr="[Gemini Vision]",
            structured_response=response.model_dump(mode="json"),
        )

        logger.info(
            f" /scan/analyze complete — {len(medicine_details)} medicines, "
            f"{len(llm_summary.get('probable_conditions', []))} conditions"
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/scan/analyze error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during advanced prescription analysis.",
        )
