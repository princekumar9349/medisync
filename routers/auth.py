"""
routers/auth.py — Authentication endpoints for Medisync.

Routes:
  POST /auth/register — Create a new user account
  POST /auth/login    — Authenticate and receive JWT token
"""

import logging
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status
import random
import string

from db import database
from models.schemas import UserCreate, UserLogin, PatientLogin, Token, UserProfile
from services.auth_service import hash_password, verify_password, create_access_token

logger = logging.getLogger("Medisync.Auth")
router = APIRouter(prefix="/auth", tags=["Authentication"])


# ─── Register ─────────────────────────────────────────────────────────────────

@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
def register(payload: UserCreate):
    """
    Create a new Medisync user account.

    - Checks for duplicate email
    - Hashes password with bcrypt
    - Stores user in MongoDB `users` collection
    - Returns the new user's profile (no password)
    """
    users_col = database.get_users()

    if users_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Please try again later.",
        )

    # ── Duplicate email check ─────────────────────────────────────
    if users_col.find_one({"email": payload.email.lower()}):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    # ── Create user document ──────────────────────────────────────
    hashed_pw = hash_password(payload.password)
    now = datetime.utcnow()

    new_user = {
        "name": payload.name.strip(),
        "email": payload.email.lower(),
        "password_hash": hashed_pw,
        "role": payload.role,
        "patient_id": ("D-" if payload.role == "doctor" else "P-") + "".join(random.choices(string.digits, k=6)), # Unique ID
        "created_at": now,
        "updated_at": now,
    }

    result = users_col.insert_one(new_user)
    user_id = str(result.inserted_id)

    logger.info(f"✅ New user registered: {payload.email} (id={user_id[:8]}...)")

    return {
        "message": "Account created successfully.",
        "user": {
            "user_id": user_id,
            "patient_id": new_user["patient_id"],
            "name": payload.name,
            "email": payload.email.lower(),
            "role": payload.role,
            "created_at": now,
        },
    }


# ─── Login ────────────────────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=Token,
    summary="Login and receive a JWT access token",
)
def login(payload: UserLogin):
    """
    Authenticate a user by email and password.

    Returns:
        JWT access token (Bearer) valid for ACCESS_TOKEN_EXPIRE_MINUTES minutes
    """
    users_col = database.get_users()

    if users_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Please try again later.",
        )

    # ── Find user by email ────────────────────────────────────────
    user = users_col.find_one({"email": payload.email.lower()})

    if not user or not verify_password(payload.password, user["password_hash"]):
        # Generic message to prevent email enumeration attacks
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ── Issue JWT ─────────────────────────────────────────────────
    user_id = str(user["_id"])
    token = create_access_token({"sub": user_id, "email": user["email"]})

    logger.info(f"🔐 User logged in: {user['email']} (id={user_id[:8]}...)")

    return Token(access_token=token, token_type="bearer")


@router.post(
    "/login/patient",
    response_model=Token,
    summary="Login as a Patient using Patient ID only",
)
def login_patient(payload: PatientLogin):
    """
    Authenticate a patient purely via their unique `patient_id`.
    Passwordless login to make the app ultra-simple for patients.
    """
    users_col = database.get_users()

    if users_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Please try again later.",
        )

    # ── Find user by patient_id ───────────────────────────────────
    user = users_col.find_one({"patient_id": payload.patient_id.strip()})

    if not user or user.get("role") != "patient":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Patient ID.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ── Issue JWT ─────────────────────────────────────────────────
    user_id = str(user["_id"])
    token = create_access_token({"sub": user_id, "email": user["email"]})

    logger.info(f"🏥 Patient logged in via ID: {payload.patient_id} (id={user_id[:8]}...)")

    return Token(access_token=token, token_type="bearer")
