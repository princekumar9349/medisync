import logging
from typing import Optional
from datetime import datetime
from db import database

logger = logging.getLogger("Medisync.OCR.Cache")

def check_cache(image_hash: str) -> Optional[dict]:
    """
    Checks if an image has already been processed and cached.
    """
    col = database.get_ocr_cache()
    if col is None:
        return None
        
    try:
        cached = col.find_one({"image_hash": image_hash})
        if cached:
            logger.info(f"OCR Cache HIT for hash {image_hash[:8]}...")
            return cached.get("extraction")
        return None
    except Exception as e:
        logger.error(f"Failed to check OCR cache: {e}")
        return None

def save_cache(image_hash: str, extraction: dict) -> None:
    """
    Saves extraction results to the OCR cache.
    """
    col = database.get_ocr_cache()
    if col is None:
        return
        
    try:
        col.update_one(
            {"image_hash": image_hash},
            {"$set": {
                "extraction": extraction,
                "cached_at": datetime.utcnow()
            }},
            upsert=True
        )
        logger.info(f"OCR Cache SAVED for hash {image_hash[:8]}...")
    except Exception as e:
        logger.error(f"Failed to save OCR cache: {e}")
