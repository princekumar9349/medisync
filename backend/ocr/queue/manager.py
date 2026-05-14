from datetime import datetime
from bson import ObjectId
from typing import Optional, Dict, Any
from db import database
import logging

logger = logging.getLogger("Medisync.OCR.Queue")

class OCRStatus:
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

def create_ocr_job(user_id: str, image_hash: str) -> str:
    """Creates a new OCR job in PENDING state."""
    col = database.get_ocr_jobs()
    job_id = col.insert_one({
        "user_id": user_id,
        "image_hash": image_hash,
        "status": OCRStatus.PENDING,
        "created_at": datetime.utcnow(),
        "error_msg": None
    }).inserted_id
    return str(job_id)

def update_job_status(job_id: str, status: str, error_msg: Optional[str] = None):
    """Updates the state of an OCR job."""
    col = database.get_ocr_jobs()
    update_data = {"status": status, "updated_at": datetime.utcnow()}
    if error_msg:
        update_data["error_msg"] = error_msg
    if status in [OCRStatus.COMPLETED, OCRStatus.FAILED]:
        update_data["completed_at"] = datetime.utcnow()
        
    col.update_one({"_id": ObjectId(job_id)}, {"$set": update_data})

def get_job_status(job_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves the current state of an OCR job."""
    col = database.get_ocr_jobs()
    job = col.find_one({"_id": ObjectId(job_id), "user_id": user_id})
    if not job:
        return None
        
    res = {
        "job_id": str(job["_id"]),
        "status": job["status"],
        "created_at": job["created_at"],
    }
    if "error_msg" in job and job["error_msg"]:
        res["error"] = job["error_msg"]
        
    return res

def save_prescription_extraction(job_id: str, validated_extraction: dict):
    """Saves the final validated AI extraction for frontend review."""
    col = database.get_prescription_extractions()
    col.insert_one({
        "job_id": job_id,
        "extraction": validated_extraction,
        "created_at": datetime.utcnow()
    })

def get_prescription_extraction(job_id: str) -> Optional[dict]:
    """Retrieves the finalized extraction payload for the frontend."""
    col = database.get_prescription_extractions()
    record = col.find_one({"job_id": job_id})
    if record:
        return record.get("extraction")
    return None
