"""
services/auth_service.py — JWT + bcrypt authentication helpers for Medisync.

Provides:
  - Password hashing / verification (bcrypt directly, no passlib)
  - JWT token creation (python-jose)
  - FastAPI dependency: get_current_user() — inject into protected routes
"""

import os
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from dotenv import load_dotenv

from models.schemas import TokenData
from security.sessions import SessionManager

load_dotenv()
logger = logging.getLogger("Medisync.Auth")

# ─── Config ───────────────────────────────────────────────────────────────────

SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "fallback_secret_change_me")
ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

# ─── Password Hashing ─────────────────────────────────────────────────────────

def _prepare(plain_password: str) -> bytes:
    """SHA-256 pre-hash so passwords > 72 bytes are handled safely."""
    return hashlib.sha256(plain_password.encode("utf-8")).hexdigest().encode("utf-8")


def hash_password(plain_password: str) -> str:
    """Hash a plain-text password using bcrypt (directly, no passlib)."""
    hashed = bcrypt.hashpw(_prepare(plain_password), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against the stored bcrypt hash."""
    return bcrypt.checkpw(_prepare(plain_password), hashed_password.encode("utf-8"))


# ─── JWT Tokens ───────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a signed JWT access token.

    Args:
        data:          Payload dict (typically {"sub": user_id, "email": email})
        expires_delta: Optional custom TTL; defaults to ACCESS_TOKEN_EXPIRE_MINUTES

    Returns:
        Encoded JWT string
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    logger.info(f"JWT token created for user: {data.get('email', 'unknown')}")
    return encoded_jwt


def decode_access_token(token: str) -> Optional[TokenData]:
    """
    Decode and validate a JWT token.

    Returns:
        TokenData with user_id, email, role, pin_version, or None if invalid/expired.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        email: str = payload.get("email")
        role: str = payload.get("role")          # present in caretaker JWTs
        pin_version: int = payload.get("pin_version")  # caretaker session version
        session_id: str = payload.get("session_id")
        if user_id is None:
            return None
        return TokenData(user_id=user_id, email=email, role=role, pin_version=pin_version, session_id=session_id)
    except JWTError as e:
        logger.warning(f"JWT decode failed: {e}")
        return None


# ─── FastAPI Dependency ───────────────────────────────────────────────────────

# Bearer token extractor (raises 403 automatically if header absent)
_bearer_scheme = HTTPBearer(auto_error=True)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> TokenData:
    """
    FastAPI dependency for protected routes.

    Usage:
        @router.get("/me")
        def me(user: TokenData = Depends(get_current_user)):
            ...

    Raises:
        401 — if token is missing, expired, or invalid
    """
    token = credentials.credentials
    token_data = decode_access_token(token)

    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # Validate stateful session if present
    if token_data.session_id:
        if not SessionManager.is_session_valid(token_data.session_id):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has expired or been revoked.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # Optionally touch session to update last_seen, but not on every request to avoid write overhead.
        # Could do it probabilistically or based on time. We'll skip for now to keep performance high.
        
    request.state.user_id = token_data.user_id

    return token_data


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        HTTPBearer(auto_error=False)
    ),
) -> Optional[TokenData]:
    """
    Optional auth dependency — used by public routes like /scan.
    Returns TokenData if a valid token is provided, otherwise None.
    """
    if credentials is None:
        return None
    return decode_access_token(credentials.credentials)


def require_patient(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    """
    Dependency that ensures the caller is a PATIENT (not a caretaker or doctor).
    Use on any patient-mutation endpoint (mark-done, scan, etc.) to prevent
    caretaker JWTs from writing patient data.
    """
    if current_user.role == "caretaker":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Caretaker access is read-only. This action requires patient authentication.",
        )
    return current_user


def require_doctor(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    """
    Dependency that ensures the caller is a DOCTOR.
    Blocks patient and caretaker JWTs from doctor-only endpoints.
    """
    if current_user.role == "caretaker":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Caretaker access is read-only and cannot access doctor controls.",
        )
    return current_user

