"""
db/database.py — MongoDB connection singleton for Medisync.

Provides named collection references used across all routers/services.
Falls back gracefully if MongoDB is unavailable (dev/offline mode).

SSL FIX: Handles TLSV1_ALERT_INTERNAL_ERROR via certifi CA bundle first,
then falls back to tlsInsecure mode for dev/restricted environments.
"""

import os
import logging
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.collection import Collection
from pymongo.errors import ConnectionFailure
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("Medisync.DB")

# ─── Connection ───────────────────────────────────────────────────────────────

MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")

# Singleton state
_client: MongoClient | None = None
_db = None
MONGO_AVAILABLE: bool = False


def connect() -> None:
    """
    Attempt to connect to MongoDB Atlas with SSL fix for TLSV1_ALERT_INTERNAL_ERROR.
    Tries multiple strategies:
      1. certifi CA bundle (standard, most compatible)
      2. tlsInsecure=True (dev fallback if cert validation fails)
    """
    global _client, _db, MONGO_AVAILABLE

    # ── Strategy 1: certifi CA bundle ────────────────────────────────────────
    try:
        import certifi
        _client = MongoClient(
            MONGO_URI,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=10000,
            socketTimeoutMS=20000,
            tls=True,
            tlsCAFile=certifi.where(),
            tlsAllowInvalidCertificates=False,
        )
        _client.admin.command("ping")
        _db = _client["medisync_db"]
        MONGO_AVAILABLE = True
        logger.info(" MongoDB connected (certifi TLS) — database: medisync_db")
        _ensure_indexes()
        return
    except Exception as err1:
        logger.warning(f"Strategy 1 (certifi TLS) failed: {err1}")
        try:
            if _client:
                _client.close()
        except Exception:
            pass
        _client = None

    # ── Strategy 2: tlsInsecure (skip certificate validation) ────────────────
    try:
        _client = MongoClient(
            MONGO_URI,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=10000,
            socketTimeoutMS=20000,
            tls=True,
            tlsAllowInvalidCertificates=True,
            tlsAllowInvalidHostnames=True,
        )
        _client.admin.command("ping")
        _db = _client["medisync_db"]
        MONGO_AVAILABLE = True
        logger.warning("MongoDB connected with tlsInsecure=True (dev mode) — database: medisync_db")
        _ensure_indexes()
        return
    except Exception as err2:
        logger.warning(f"Strategy 2 (tlsInsecure) failed: {err2}")
        try:
            if _client:
                _client.close()
        except Exception:
            pass
        _client = None

    # ── All strategies failed ─────────────────────────────────────────────────
    MONGO_AVAILABLE = False
    _db = None
    logger.error("MongoDB unavailable — running in offline mode. Auth/DB features disabled.")


def _ensure_indexes() -> None:
    """Create indexes for common query patterns (idempotent)."""
    try:
        _db["users"].create_index([("email", ASCENDING)], unique=True)
        _db["prescriptions"].create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
        _db["dose_logs"].create_index([("user_id", ASCENDING), ("med_id", ASCENDING), ("timestamp", DESCENDING)])
        _db["insights"].create_index([("user_id", ASCENDING), ("generated_at", DESCENDING)])
        _db["doctor_chats"].create_index([("user_id", ASCENDING), ("timestamp", ASCENDING)])
        _db["patient_memory"].create_index([("user_id", ASCENDING)], unique=True)
        _db["scan_intelligence"].create_index([("user_id", ASCENDING), ("scanned_at", DESCENDING)])
        _db["emergencies"].create_index([("user_id", ASCENDING), ("status", ASCENDING), ("created_at", DESCENDING)])
        _db["notifications"].create_index([("user_id", ASCENDING), ("read", ASCENDING), ("created_at", DESCENDING)])
        _db["notifications"].create_index([("user_id", ASCENDING), ("type", ASCENDING)])
        logger.info("MongoDB indexes ensured.")
    except Exception as e:
        logger.warning(f"Index creation warning (non-fatal): {e}")


# ─── Collection Accessors ─────────────────────────────────────────────────────

def get_users() -> Collection | None:
    return _db["users"] if _db is not None else None

def get_prescriptions() -> Collection | None:
    return _db["prescriptions"] if _db is not None else None

def get_medications() -> Collection | None:
    return _db["medications"] if _db is not None else None

def get_dose_logs() -> Collection | None:
    return _db["dose_logs"] if _db is not None else None

def get_insights() -> Collection | None:
    return _db["insights"] if _db is not None else None

def get_doctor_chats() -> Collection | None:
    return _db["doctor_chats"] if _db is not None else None

def get_symptoms() -> Collection | None:
    return _db["symptoms"] if _db is not None else None

def get_patient_memory() -> Collection | None:
    """Patient memory collection — accumulated across prescriptions for chatbot continuity."""
    return _db["patient_memory"] if _db is not None else None

def get_scan_intelligence() -> Collection | None:
    """Stores full /scan/analyze results (raw OCR + structured JSON) for auditability."""
    return _db["scan_intelligence"] if _db is not None else None

def get_otps() -> Collection | None:
    """Stores temporary OTPs for phone verification."""
    return _db["otps"] if _db is not None else None

def get_call_logs() -> Collection | None:
    """Stores logs of AI calls and Caregiver escalations."""
    return _db["call_logs"] if _db is not None else None

def get_emergencies() -> Collection | None:
    """Stores patient emergency SOS requests with status tracking."""
    return _db["emergencies"] if _db is not None else None

def get_notifications() -> Collection | None:
    """Notification inbox — stores all user notifications with read state and analytics."""
    return _db["notifications"] if _db is not None else None

def ping() -> bool:
    """Live health check — used by /health-check endpoint."""
    if _client is None or not MONGO_AVAILABLE:
        return False
    try:
        _client.admin.command("ping")
        return True
    except Exception:
        return False
