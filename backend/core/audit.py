import logging
from datetime import datetime
from typing import Optional, Any
from fastapi import Request

from db import database
from core.logger import get_logger

logger = get_logger("Medisync.Audit")

def extract_device_metadata(request: Request) -> dict[str, str]:
    """Extract standard device and IP metadata from a FastAPI request."""
    forwarded_for = request.headers.get("x-forwarded-for")
    ip_address = forwarded_for.split(",")[0].strip() if forwarded_for else request.client.host if request.client else "unknown"
    
    return {
        "ip_address": ip_address,
        "user_agent": request.headers.get("user-agent", "unknown"),
        "request_id": request.headers.get("x-request-id", "unknown")
    }

def log_audit_event(
    action: str,
    actor_id: str,
    actor_role: str,
    target_id: Optional[str] = None,
    session_id: Optional[str] = None,
    device_metadata: Optional[dict[str, str]] = None,
    details: Optional[dict[str, Any]] = None,
) -> None:
    """
    Log an immutable audit event for critical state mutations.
    Writes to MongoDB for querying and Cloud Logging for observability.
    
    Args:
        action: String identifying the action (e.g., 'caregiver_login', 'dose_edit').
        actor_id: ID of the user performing the action.
        actor_role: Role of the actor (patient, doctor, caregiver, admin).
        target_id: Optional ID of the entity being acted upon (e.g., patient ID, prescription ID).
        session_id: Optional tracking for stateful sessions.
        device_metadata: Output from extract_device_metadata.
        details: Optional JSON-serializable dictionary of specific changes.
    """
    timestamp = datetime.utcnow()
    
    event = {
        "timestamp": timestamp,
        "action": action,
        "actor_id": actor_id,
        "actor_role": actor_role,
        "target_id": target_id,
        "session_id": session_id,
        "device_metadata": device_metadata or {},
        "details": details or {},
    }
    
    # 1. Cloud Logging (Structured Logger Emission)
    logger.info(f"AUDIT | {action} | actor={actor_id} ({actor_role}) | target={target_id} | session={session_id}", extra={"audit_event": event})
    
    # 2. Immutable DB storage
    audit_col = database.get_audit_logs()
    if audit_col is not None:
        try:
            audit_col.insert_one(event)
        except Exception as e:
            logger.error(f"Failed to persist audit event to MongoDB: {e}")
            # Event is still captured in Cloud Logging from step 1
