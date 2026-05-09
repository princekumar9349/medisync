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
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from dotenv import load_dotenv

from models.schemas import TokenData

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
        TokenData with user_id and email, or None if invalid/expired.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        email: str = payload.get("email")
        if user_id is None:
            return None
        return TokenData(user_id=user_id, email=email)
    except JWTError as e:
        logger.warning(f"JWT decode failed: {e}")
        return None


# ─── FastAPI Dependency ───────────────────────────────────────────────────────

# Bearer token extractor (raises 403 automatically if header absent)
_bearer_scheme = HTTPBearer(auto_error=True)


def get_current_user(
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
