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
