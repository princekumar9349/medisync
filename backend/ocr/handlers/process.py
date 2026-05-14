import logging
import asyncio
from typing import List
from ocr.queue.manager import update_job_status, OCRStatus, save_prescription_extraction
from ocr.preprocessing.pipeline import detect_blur, preprocess_image
from ocr.extraction.vision import extract_prescription
from ocr.validators.confidence import sanitize_and_validate_extraction
from ocr.cache.manager import save_cache

logger = logging.getLogger("Medisync.OCR.Process")

async def process_prescription_async(job_id: str, images_bytes: List[bytes], image_hash: str):
    """
    Background worker function that orchestrates the entire OCR intelligence pipeline.
    Ensures the user API doesn't block while Gemini processes images.
    """
    try:
        update_job_status(job_id, OCRStatus.PROCESSING)
        
        processed_images = []
        for i, img_bytes in enumerate(images_bytes):
            # 1. Blur Detection
            if detect_blur(img_bytes):
                # We could reject entirely, or let Gemini try its best. The user requested:
                # "Add blur/unreadable image detection BEFORE Gemini processing. This will significantly reduce wasted Vision API cost"
                logger.warning(f"Image {i} is too blurry. Rejecting before Gemini.")
                update_job_status(job_id, OCRStatus.FAILED, error_msg="Image is too blurry or unreadable. Please capture a clearer photo.")
                return
                
            # 2. Preprocessing
            processed_bytes = preprocess_image(img_bytes)
            processed_images.append(processed_bytes)
            
        # 3. Gemini Vision Extraction
        raw_extraction = extract_prescription(processed_images)
        if not raw_extraction:
            update_job_status(job_id, OCRStatus.FAILED, error_msg="AI failed to extract data. Please try again.")
            return
            
        # 4. Validation and Sanitization
        validated_data = sanitize_and_validate_extraction(raw_extraction)
        
        # 5. Save to Caching Layer (so future uploads of the same exact image don't hit Gemini)
        save_cache(image_hash, validated_data)
        
        # 6. Save Final Result to Job
        save_prescription_extraction(job_id, validated_data)
        update_job_status(job_id, OCRStatus.COMPLETED)
        
    except Exception as e:
        logger.error(f"OCR Pipeline failed for job {job_id}: {e}")
        update_job_status(job_id, OCRStatus.FAILED, error_msg="An unexpected error occurred during processing.")
