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
from typing import Optional, List
import asyncio

from fastapi import APIRouter, File, HTTPException, UploadFile, Depends, status

from db import database
from models.schemas import Medicine, ScanResponse, TokenData
from services.auth_service import get_optional_user
from services.llm_service import scan_prescription_with_vision, calculate_expiry
from security.rate_limit import RateLimiter
from security.upload_validator import validate_upload

# OCR Imports
from ocr.cache.hash import compute_image_hash
from ocr.cache.manager import check_cache
from ocr.queue.manager import create_ocr_job, get_job_status, get_prescription_extraction, OCRStatus
from ocr.handlers.process import process_prescription_async

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
    summary="Enqueue a prescription image for OCR scanning",
)
async def scan_prescription(
    files: List[UploadFile] = File(...),
    current_user: Optional[TokenData] = Depends(get_optional_user),
    _: None = Depends(RateLimiter(max_requests=5, window_seconds=900, prefix="scan")),
):
    """
    New Async OCR Pipeline:
    1. Validate all uploads.
    2. Compute hash of the primary image for caching.
    3. Check OCR cache -> return immediately if processed.
    4. Enqueue job and trigger background worker.
    5. Return job_id for frontend to poll.
    """
    try:
        user_id = current_user.user_id if current_user else "anonymous"
        
        images_bytes = []
        for file in files:
            _, img_bytes = await validate_upload(file)
            images_bytes.append(img_bytes)
            
        if not images_bytes:
            raise HTTPException(status_code=400, detail="No valid images provided.")
            
        # Hash the combination of all bytes for aggressive caching
        combined_bytes = b"".join(images_bytes)
        img_hash = compute_image_hash(combined_bytes)
        
        # Check Cache
        cached_result = check_cache(img_hash)
        if cached_result:
            logger.info("OCR Cache hit! Returning instant job completion.")
            # Create a dummy job ID or directly return the data?
            # To maintain the async flow contract, we can create a job that is already COMPLETED.
            job_id = create_ocr_job(user_id, img_hash)
            from ocr.queue.manager import update_job_status, save_prescription_extraction
            save_prescription_extraction(job_id, cached_result)
            update_job_status(job_id, OCRStatus.COMPLETED)
            return {"job_id": job_id, "status": OCRStatus.COMPLETED}

        # Enqueue new job
        job_id = create_ocr_job(user_id, img_hash)
        
        # Fire background task
        loop = asyncio.get_event_loop()
        loop.create_task(process_prescription_async(job_id, images_bytes, img_hash))
        
        return {"job_id": job_id, "status": OCRStatus.PENDING}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Scan enqueue error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during queue submission.",
        )

@router.get("/scan/status/{job_id}", summary="Poll OCR job status")
async def get_scan_status(
    job_id: str,
    current_user: Optional[TokenData] = Depends(get_optional_user)
):
    """
    Frontend polls this endpoint to get OCR status.
    If COMPLETED, returns the full extraction payload for manual review.
    """
    user_id = current_user.user_id if current_user else "anonymous"
    
    status_dict = get_job_status(job_id, user_id)
    if not status_dict:
        raise HTTPException(status_code=404, detail="Job not found")
        
    if status_dict["status"] == OCRStatus.COMPLETED:
        extraction = get_prescription_extraction(job_id)
        status_dict["extraction"] = extraction
        
    return status_dict



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
from services.ai_adherence import check_drug_interactions


@router.post(
    "/scan/analyze",
    response_model=PrescriptionIntelligenceResponse,
    summary="Advanced prescription intelligence with patient memory",
)
async def analyze_prescription(
    file: UploadFile = File(...),
    current_user: Optional[TokenData] = Depends(get_optional_user),
    _: None = Depends(RateLimiter(max_requests=5, window_seconds=900, prefix="scan_analyze")),
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
        # ── 1. Read image and validate ────────────────────────────
        _, image_bytes = await validate_upload(file)

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
        
        # Check for drug interactions among the detected medicines
        drug_interactions_warning = await check_drug_interactions(llm_meds)
        if "No known" not in drug_interactions_warning and "Unable to verify" not in drug_interactions_warning:
            llm_summary.setdefault("risk_flags", []).append(drug_interactions_warning)

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
