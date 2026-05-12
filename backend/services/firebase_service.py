"""
services/firebase_service.py — Firebase Admin SDK Singleton Initializer

Initializes firebase_admin exactly once at backend startup.
All other modules call get_firebase_app() to obtain the initialized app
before using firebase_admin.messaging.

Usage:
    # In main.py lifespan:
    from services.firebase_service import initialize_firebase
    initialize_firebase()

    # Anywhere else:
    from services.firebase_service import get_firebase_app
    app = get_firebase_app()  # returns None if not initialized

Environment:
    FIREBASE_CREDENTIALS=firebase/serviceAccountKey.json
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger("Medisync.Firebase")

_firebase_app = None          # singleton
_initialized  = False         # guard against double-init


def initialize_firebase() -> bool:
    """
    Initialize Firebase Admin SDK from service account JSON.
    Safe to call multiple times — only runs once.

    Returns:
        True  — initialized successfully (or already was)
        False — credential file missing or SDK error
    """
    global _firebase_app, _initialized

    if _initialized:
        return _firebase_app is not None

    cred_path = os.getenv("FIREBASE_CREDENTIALS", "firebase/serviceAccountKey.json")

    # Resolve relative to backend directory (where main.py lives)
    if not Path(cred_path).is_absolute():
        backend_root = Path(__file__).parent.parent
        cred_path = str(backend_root / cred_path)

    if not Path(cred_path).exists():
        logger.error(
            f"[Firebase] ❌ Credential file not found: {cred_path}. "
            "Push notifications will be disabled."
        )
        _initialized = True     # don't retry on every request
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials

        cred = credentials.Certificate(cred_path)
        _firebase_app = firebase_admin.initialize_app(cred)
        _initialized = True
        logger.info(f"[Firebase] ✅ Initialized successfully (project: {_firebase_app.project_id})")
        return True

    except ValueError as e:
        # Already initialized (shouldn't happen with guard, but belt-and-suspenders)
        if "already exists" in str(e).lower():
            import firebase_admin
            _firebase_app = firebase_admin.get_app()
            _initialized = True
            logger.info("[Firebase] ✅ Re-using existing Firebase app")
            return True
        logger.error(f"[Firebase] ❌ Initialization error: {e}")
        _initialized = True
        return False

    except Exception as e:
        logger.error(f"[Firebase] ❌ Unexpected initialization error: {e}")
        _initialized = True
        return False


def get_firebase_app():
    """Return the initialized Firebase app, or None if unavailable."""
    return _firebase_app


def is_firebase_ready() -> bool:
    """Quick check — True only when Firebase initialized without error."""
    return _firebase_app is not None
