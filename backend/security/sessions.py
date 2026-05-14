import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from bson import ObjectId

from db import database
from core.logger import get_logger

logger = get_logger("Medisync.Sessions")

class SessionManager:
    """
    Manages stateful authentication sessions in MongoDB.
    Initially used only for caregiver sessions to allow immediate revocation
    without waiting for JWT expiry.
    """
    
    @staticmethod
    def create_session(user_id: str, role: str, ttl_minutes: int, device_id: Optional[str] = None) -> str:
        """Create a new session and return the session_id."""
        sessions_col = database.get_sessions()
        if sessions_col is None:
            # DB unavailable fallback
            return f"offline-sess-{secrets.token_hex(8)}"
            
        session_id = f"sess_{secrets.token_urlsafe(32)}"
        now = datetime.utcnow()
        expires_at = now + timedelta(minutes=ttl_minutes)
        
        session_doc = {
            "session_id": session_id,
            "user_id": user_id,
            "role": role,
            "device_id": device_id,
            "created_at": now,
            "expires_at": expires_at,
            "revoked_at": None,
            "last_seen": now
        }
        
        sessions_col.insert_one(session_doc)
        return session_id

    @staticmethod
    def is_session_valid(session_id: str) -> bool:
        """Check if a session exists and is not revoked/expired."""
        if session_id.startswith("offline-sess-"):
            return True # Assume valid if DB was offline during creation
            
        sessions_col = database.get_sessions()
        if sessions_col is None:
            return True # Fail open if DB is down to not block users, or fail closed? We fail open for reliability.
            
        session = sessions_col.find_one({"session_id": session_id})
        if not session:
            return False
            
        if session.get("revoked_at"):
            return False
            
        if datetime.utcnow() > session.get("expires_at", datetime.utcnow()):
            return False
            
        return True

    @staticmethod
    def revoke_session(session_id: str) -> bool:
        """Mark a specific session as revoked."""
        if session_id.startswith("offline-sess-"):
            return True
            
        sessions_col = database.get_sessions()
        if sessions_col is None:
            return False
            
        result = sessions_col.update_one(
            {"session_id": session_id},
            {"$set": {"revoked_at": datetime.utcnow()}}
        )
        return result.modified_count > 0

    @staticmethod
    def revoke_all_sessions(user_id: str, role: Optional[str] = None) -> int:
        """Revoke all active sessions for a user (optionally filtered by role)."""
        sessions_col = database.get_sessions()
        if sessions_col is None:
            return 0
            
        query: Dict[str, Any] = {
            "user_id": user_id,
            "revoked_at": None,
            "expires_at": {"$gt": datetime.utcnow()}
        }
        if role:
            query["role"] = role
            
        result = sessions_col.update_many(
            query,
            {"$set": {"revoked_at": datetime.utcnow()}}
        )
        return result.modified_count

    @staticmethod
    def touch_session(session_id: str) -> None:
        """Update last_seen timestamp. Called occasionally, not on every request."""
        if session_id.startswith("offline-sess-"):
            return
            
        sessions_col = database.get_sessions()
        if sessions_col is not None:
            sessions_col.update_one(
                {"session_id": session_id},
                {"$set": {"last_seen": datetime.utcnow()}}
            )
