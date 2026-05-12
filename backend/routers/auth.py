"""
routers/auth.py — Authentication endpoints for Medisync.

Routes:
  POST /auth/register                  — Create a new user account
  POST /auth/login                     — Authenticate and receive JWT token
  POST /auth/login/patient             — Passwordless patient login by ID
  POST /auth/caretaker-login           — Caretaker login with patient_id + PIN (rate-limited)
  PUT  /auth/set-caretaker-pin         — Patient sets/updates their caretaker access PIN

  [NEW] POST   /auth/caretaker/generate-pin — Auto-generate PIN (returns plain PIN once)
  [NEW] GET    /auth/caretaker/status       — Patient views their caretaker access status
  [NEW] DELETE /auth/caretaker/revoke       — Patient revokes all caretaker access
"""

import logging
import hashlib
import os
import smtplib
import time
import random
import string
from collections import defaultdict
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status, Depends, Request

from db import database
from models.schemas import (
    UserCreate, UserLogin, PatientLogin, Token, UserProfile,
    CaretakerLogin, CaretakerToken, SetCaretakerPin,
    GenerateCaretakerPinRequest, GeneratedPinResponse, CaretakerStatusResponse,
    CaretakerToggleRequest, ForgotPasswordRequest, ResetPasswordRequest,
    SessionInfoResponse,
)
from services.auth_service import (
    hash_password, verify_password,
    create_access_token, get_current_user,
)
from models.schemas import TokenData

logger = logging.getLogger("Medisync.Auth")
router = APIRouter(prefix="/auth", tags=["Authentication"])

# ─── Config ───────────────────────────────────────────────────────────────────
_MAX_ATTEMPTS         = 5
_LOCKOUT_SECS         = 300   # 5-min lockout after 5 failures
_CARETAKER_JWT_MINUTES = 60   # 1-hour caretaker session
_RESET_CODE_TTL_MIN   = 15    # password reset code expiry
_RESET_MAX_ATTEMPTS   = 3     # max wrong reset-code tries before invalidation
MOCK_OTP_ENABLED      = os.getenv("MOCK_OTP_ENABLED", "true").lower() == "true"

# ─── In-memory rate-limit stores ──────────────────────────────────────────────
# PIN brute-force: { patient_id: {"attempts": N, "locked_until": ts} }
_pin_attempts: dict = defaultdict(lambda: {"attempts": 0, "locked_until": 0.0})
# Forgot-password rate-limit: { email: last_request_ts }
_reset_requests: dict = {}


def _check_pin_rate_limit(patient_id: str):
    """Raise 429 if patient_id is locked out for caretaker PIN attempts."""
    state = _pin_attempts[patient_id]
    now = time.time()
    if state["locked_until"] > now:
        secs_left = int(state["locked_until"] - now)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in {secs_left} seconds.",
        )


def _record_pin_failure(patient_id: str):
    state = _pin_attempts[patient_id]
    state["attempts"] += 1
    if state["attempts"] >= _MAX_ATTEMPTS:
        state["locked_until"] = time.time() + _LOCKOUT_SECS
        state["attempts"] = 0
        logger.warning(f"[Auth] Caretaker PIN locked for patient {patient_id} after {_MAX_ATTEMPTS} failures")


def _reset_pin_attempts(patient_id: str):
    _pin_attempts[patient_id] = {"attempts": 0, "locked_until": 0.0}


def _hash_pin(pin: str) -> str:
    """One-way SHA-256 hash of the PIN (not reversible)."""
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()


def _generate_random_pin(length: int = 6) -> str:
    """Generate a cryptographically random numeric PIN."""
    return "".join(random.choices(string.digits, k=length))


# ─── Helper: send password-reset email ───────────────────────────────────────

def _send_reset_email(to_email: str, reset_code: str, name: str = "User"):
    """
    Send reset code via SMTP.  Falls back to console log if SMTP not configured.
    """
    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASS = os.getenv("SMTP_PASS", "")
    SMTP_FROM = os.getenv("SMTP_FROM", "noreply@medisync.app")

    subject = "MediSync — Password Reset Code"
    body = (
        f"Hi {name},\n\n"
        f"Your MediSync password reset code is:\n\n"
        f"    {reset_code}\n\n"
        f"This code expires in {_RESET_CODE_TTL_MIN} minutes.\n"
        f"If you did not request this, ignore this email.\n\n"
        f"— The MediSync Team"
    )

    if not SMTP_HOST or not SMTP_USER:
        # DEV mode: log to console
        logger.info(
            f"[DEV] Password reset code for {to_email}: {reset_code}\n"
            f"Set SMTP_HOST/SMTP_USER/SMTP_PASS in .env for real emails."
        )
        return

    try:
        msg = MIMEMultipart()
        msg["From"]    = SMTP_FROM
        msg["To"]      = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=8) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM, to_email, msg.as_string())
        logger.info(f"[Auth] Reset email sent to {to_email}")
    except Exception as e:
        logger.warning(f"[Auth] SMTP failed for {to_email}: {e} — code logged above")
        logger.info(f"[FALLBACK] Reset code for {to_email}: {reset_code}")


# ─── Register ─────────────────────────────────────────────────────────────────

@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
def register(payload: UserCreate):
    """
    Create a new Medisync user account.
    - Optional phone + specialization (doctor)
    - Phone verification is opt-in, never blocks registration
    - Session tracking fields initialized
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
    pid = ("D-" if payload.role == "doctor" else "P-") + "".join(random.choices(string.digits, k=6))

    new_user = {
        "name": payload.name.strip(),
        "email": payload.email.lower(),
        "password_hash": hashed_pw,
        "role": payload.role,
        "patient_id": pid,
        "created_at": now,
        "updated_at": now,
        # Optional phone
        "phone": payload.phone.strip() if payload.phone else None,
        "phone_verified": False,
        # Doctor specialization
        "specialization": payload.specialization.strip() if payload.specialization else None,
        # Session tracking
        "login_count": 0,
        "last_login_at": None,
        "fcm_tokens": [],
    }

    result = users_col.insert_one(new_user)
    user_id = str(result.inserted_id)
    logger.info(f"New {payload.role} registered: {payload.email} (id={user_id[:8]}...) pid={pid}")

    return {
        "message": "Account created successfully.",
        "verify_phone_next": bool(payload.phone and payload.verify_phone_now),
        "user": {
            "user_id": user_id,
            "patient_id": pid,
            "name": payload.name,
            "email": payload.email.lower(),
            "role": payload.role,
            "phone": new_user["phone"],
            "specialization": new_user["specialization"],
            "created_at": now,
        },
    }


# ─── Standard Login ───────────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=Token,
    summary="Login and receive a JWT access token",
)
def login(payload: UserLogin):
    """Authenticate a user by email and password. Tracks session metadata."""
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Please try again later.",
        )

    user = users_col.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = str(user["_id"])
    now = datetime.utcnow()

    # Track session
    try:
        users_col.update_one(
            {"_id": user["_id"]},
            {"$set": {"last_login_at": now}, "$inc": {"login_count": 1}},
        )
    except Exception:
        pass

    token = create_access_token({"sub": user_id, "email": user["email"]})
    logger.info(f"User logged in: {user['email']} (id={user_id[:8]}...)")
    return Token(access_token=token, token_type="bearer")


# ─── Patient Quick Login ──────────────────────────────────────────────────────

@router.post(
    "/login/patient",
    response_model=Token,
    summary="Login as a Patient using Patient ID only",
)
def login_patient(payload: PatientLogin):
    """Authenticate a patient purely via their unique patient_id."""
    users_col = database.get_users()

    if users_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Please try again later.",
        )

    user = users_col.find_one({"patient_id": payload.patient_id.strip()})

    if not user or user.get("role") != "patient":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Patient ID.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = str(user["_id"])
    token = create_access_token({"sub": user_id, "email": user["email"]})

    logger.info(f"Patient logged in via ID: {payload.patient_id} (id={user_id[:8]}...)")
    return Token(access_token=token, token_type="bearer")


# ─── Caretaker Login ─────────────────────────────────────────────────────────

@router.post(
    "/caretaker-login",
    response_model=CaretakerToken,
    summary="Caretaker login: read-only session using patient_id + PIN",
)
def caretaker_login(payload: CaretakerLogin):
    """
    Authenticate a family member/caretaker.

    - PIN is stored as a SHA-256 hash in the patient's user document
    - Issues a short-lived (1 hour) JWT with role=caretaker
    - Rate-limited: 5 failed attempts → 5 minute lockout
    - Logs activity (last login, session count) to patient document
    - JWT embeds pin_version — old tokens are rejected if PIN is regenerated
    """
    _check_pin_rate_limit(payload.patient_id)

    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    patient = users_col.find_one({"patient_id": payload.patient_id.strip()})

    if not patient or patient.get("role") != "patient":
        _record_pin_failure(payload.patient_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Patient ID or PIN.",
        )

    # ── Check caretaker access is enabled ────────────────────────
    if not patient.get("caretaker_access_enabled", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Caretaker access is disabled for this patient. Ask them to enable it in Profile → Caretaker Access.",
        )

    stored_hash = patient.get("caretaker_pin_hash")
    if not stored_hash:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This patient has not set up a caretaker PIN. Ask them to generate one in Profile → Caretaker Access.",
        )

    submitted_hash = _hash_pin(payload.caretaker_pin)
    if submitted_hash != stored_hash:
        _record_pin_failure(payload.patient_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Patient ID or PIN.",
        )

    # ── PIN correct — log activity ────────────────────────────────
    _reset_pin_attempts(payload.patient_id)
    patient_id_str = str(patient["_id"])
    now = datetime.utcnow()
    pin_version = patient.get("caretaker_pin_version", 0)
    new_session_count = patient.get("caretaker_session_count", 0) + 1

    try:
        users_col.update_one(
            {"_id": patient["_id"]},
            {"$set": {
                "caretaker_last_login": now,
                "caretaker_session_count": new_session_count,
                "updated_at": now,
            }},
        )
    except Exception as e:
        logger.warning(f"[Auth] Failed to log caretaker activity: {e}")

    # ── Issue short-lived caretaker JWT ──────────────────────────
    token = create_access_token(
        {
            "sub": patient_id_str,
            "email": patient.get("email", ""),
            "role": "caretaker",               # explicit caretaker role in JWT
            "linked_patient_id": payload.patient_id,
            "pin_version": pin_version,        # invalidated if PIN is regenerated
        },
        expires_delta=timedelta(minutes=_CARETAKER_JWT_MINUTES),
    )

    caretaker_name = patient.get("caretaker_access_name")
    relationship   = patient.get("caretaker_relationship")

    logger.info(
        f"[Auth] Caretaker logged in for patient {payload.patient_id} "
        f"(session #{new_session_count})"
    )

    return CaretakerToken(
        access_token=token,
        token_type="bearer",
        linked_patient_id=payload.patient_id,
        patient_name=patient.get("name", ""),
        caretaker_name=caretaker_name,
        relationship=relationship,
        expires_in=_CARETAKER_JWT_MINUTES * 60,
        session_number=new_session_count,
    )


# ─── Patient Sets Caretaker PIN (manual) ─────────────────────────────────────

@router.put(
    "/set-caretaker-pin",
    summary="Patient manually sets or updates their caretaker access PIN (hashed)",
)
def set_caretaker_pin(
    payload: SetCaretakerPin,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Allows a logged-in patient to set/change their caretaker access PIN.
    PIN is hashed with SHA-256 before storage — never stored in plain text.
    Increments pin_version to invalidate all previous caretaker JWTs.
    """
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    # Fetch current pin_version to increment
    patient = users_col.find_one({"_id": ObjectId(current_user.user_id)}, {"caretaker_pin_version": 1})
    current_version = (patient or {}).get("caretaker_pin_version", 0)

    pin_hash = _hash_pin(payload.caretaker_pin)
    update_doc = {
        "caretaker_pin_hash": pin_hash,
        "caretaker_pin_version": current_version + 1,  # invalidate old JWTs
        "caretaker_access_enabled": True,
        "updated_at": datetime.utcnow(),
    }
    if payload.caretaker_name:
        update_doc["caretaker_access_name"] = payload.caretaker_name.strip()

    users_col.update_one(
        {"_id": ObjectId(current_user.user_id)},
        {"$set": update_doc},
    )

    logger.info(f"[Auth] Caretaker PIN manually updated for user {current_user.user_id[:8]}... (v{current_version + 1})")
    return {"message": "Caretaker PIN set successfully."}


# ─── [NEW] Generate PIN Auto ─────────────────────────────────────────────────

@router.post(
    "/caretaker/generate-pin",
    response_model=GeneratedPinResponse,
    summary="Patient auto-generates a secure 6-digit caretaker PIN (plain shown ONCE)",
)
def generate_caretaker_pin(
    payload: GenerateCaretakerPinRequest,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Auto-generates a random 6-digit PIN for caretaker access.

    Security:
    - Plain PIN is returned ONCE and never stored
    - Only the SHA-256 hash is persisted
    - pin_version increments → all previous caretaker JWTs are invalidated
    - caretaker_access_enabled is set to True automatically
    """
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    # Verify the user is a patient
    patient = users_col.find_one(
        {"_id": ObjectId(current_user.user_id)},
        {"role": 1, "patient_id": 1, "caretaker_pin_version": 1},
    )
    if not patient:
        raise HTTPException(status_code=404, detail="User not found.")
    if patient.get("role") != "patient":
        raise HTTPException(status_code=403, detail="Only patients can manage caretaker access.")

    plain_pin = _generate_random_pin(6)
    pin_hash  = _hash_pin(plain_pin)
    current_version = patient.get("caretaker_pin_version", 0)
    now = datetime.utcnow()

    update_doc = {
        "caretaker_pin_hash": pin_hash,
        "caretaker_pin_version": current_version + 1,  # invalidate old sessions
        "caretaker_access_enabled": True,
        "caretaker_session_count": 0,                  # reset session counter
        "caretaker_last_login": None,                  # reset last login
        "updated_at": now,
    }
    if payload.caretaker_name:
        update_doc["caretaker_access_name"] = payload.caretaker_name.strip()
    if payload.relationship:
        update_doc["caretaker_relationship"] = payload.relationship.strip()

    users_col.update_one(
        {"_id": ObjectId(current_user.user_id)},
        {"$set": update_doc},
    )

    logger.info(
        f"[Auth] Caretaker PIN generated for patient {patient.get('patient_id')} "
        f"(v{current_version + 1})"
    )

    return GeneratedPinResponse(
        plain_pin=plain_pin,
        patient_id=patient.get("patient_id", ""),
        caretaker_name=payload.caretaker_name,
        relationship=payload.relationship,
        message="Store this PIN safely — it cannot be retrieved again.",
    )


# ─── [NEW] Caretaker Access Status ───────────────────────────────────────────

@router.get(
    "/caretaker/status",
    response_model=CaretakerStatusResponse,
    summary="Patient views their current caretaker access status",
)
def get_caretaker_status(current_user: TokenData = Depends(get_current_user)):
    """
    Returns the authenticated patient's caretaker access configuration.
    Used by CaretakerSettingsScreen to show current state.
    """
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    patient = users_col.find_one(
        {"_id": ObjectId(current_user.user_id)},
        {
            "role": 1,
            "patient_id": 1,
            "caretaker_pin_hash": 1,
            "caretaker_access_enabled": 1,
            "caretaker_access_name": 1,
            "caretaker_relationship": 1,
            "caretaker_last_login": 1,
            "caretaker_session_count": 1,
            "caretaker_pin_version": 1,
        },
    )
    if not patient:
        raise HTTPException(status_code=404, detail="User not found.")
    if patient.get("role") != "patient":
        raise HTTPException(status_code=403, detail="Only patients can view caretaker status.")

    has_pin = bool(patient.get("caretaker_pin_hash"))
    enabled = patient.get("caretaker_access_enabled", False) and has_pin

    return CaretakerStatusResponse(
        has_caretaker_pin=has_pin,
        access_enabled=enabled,
        caretaker_name=patient.get("caretaker_access_name"),
        relationship=patient.get("caretaker_relationship"),
        patient_id=patient.get("patient_id"),
        last_login=patient.get("caretaker_last_login"),
        session_count=patient.get("caretaker_session_count", 0),
        session_duration_minutes=_CARETAKER_JWT_MINUTES,
        pin_version=patient.get("caretaker_pin_version", 0),
    )


# ─── [NEW] Revoke Caretaker Access ───────────────────────────────────────────

@router.delete(
    "/caretaker/revoke",
    summary="Patient fully revokes caretaker access (deletes PIN, invalidates sessions)",
)
def revoke_caretaker_access(current_user: TokenData = Depends(get_current_user)):
    """
    Completely removes caretaker access for the patient.

    Actions:
    - Deletes caretaker_pin_hash (login will fail)
    - Sets caretaker_access_enabled = False
    - Increments pin_version (invalidates any active caretaker JWTs)
    - Resets session count and last login
    """
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    patient = users_col.find_one(
        {"_id": ObjectId(current_user.user_id)},
        {"role": 1, "patient_id": 1, "caretaker_pin_version": 1},
    )
    if not patient:
        raise HTTPException(status_code=404, detail="User not found.")
    if patient.get("role") != "patient":
        raise HTTPException(status_code=403, detail="Only patients can revoke caretaker access.")

    current_version = patient.get("caretaker_pin_version", 0)
    now = datetime.utcnow()

    users_col.update_one(
        {"_id": ObjectId(current_user.user_id)},
        {
            "$unset": {
                "caretaker_pin_hash": "",
                "caretaker_access_name": "",
                "caretaker_relationship": "",
            },
            "$set": {
                "caretaker_access_enabled": False,
                "caretaker_pin_version": current_version + 1,  # kill active JWTs
                "caretaker_session_count": 0,
                "caretaker_last_login": None,
                "updated_at": now,
            },
        },
    )

    logger.info(
        f"[Auth] Caretaker access REVOKED for patient {patient.get('patient_id')} "
        f"(v→{current_version + 1})"
    )
    return {
        "message": "Caretaker access has been fully revoked. All active caretaker sessions are now invalid.",
        "patient_id": patient.get("patient_id"),
    }


# ─── [NEW] Toggle Caretaker Access (enable/disable without resetting PIN) ──────

@router.patch(
    "/caretaker/toggle",
    summary="Patient enables or disables caretaker access without changing PIN",
)
def toggle_caretaker_access(
    payload: CaretakerToggleRequest,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Lets a patient quickly enable or disable caretaker login without clearing
    their existing PIN hash.  Useful for temporarily locking access while
    travelling or during a sensitive period, then re-enabling without needing
    to regenerate and re-share a new PIN.

    - Requires the patient to have already set a PIN (403 otherwise)
    - Does NOT invalidate existing caretaker JWTs (use /revoke for that)
    """
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    patient = users_col.find_one(
        {"_id": ObjectId(current_user.user_id)},
        {"role": 1, "patient_id": 1, "caretaker_pin_hash": 1},
    )
    if not patient:
        raise HTTPException(status_code=404, detail="User not found.")
    if patient.get("role") != "patient":
        raise HTTPException(status_code=403, detail="Only patients can manage caretaker access.")

    if payload.enabled and not patient.get("caretaker_pin_hash"):
        raise HTTPException(
            status_code=403,
            detail="Generate a caretaker PIN first before enabling access.",
        )

    users_col.update_one(
        {"_id": ObjectId(current_user.user_id)},
        {"$set": {
            "caretaker_access_enabled": payload.enabled,
            "updated_at": datetime.utcnow(),
        }},
    )

    action = "enabled" if payload.enabled else "disabled"
    logger.info(
        f"[Auth] Caretaker access {action} for patient {patient.get('patient_id')}"
    )
    return {
        "message": f"Caretaker access {action} successfully.",
        "access_enabled": payload.enabled,
    }


# ─── Forgot Password ──────────────────────────────────────────────────────────

@router.post("/forgot-password", summary="Request a password reset code via email")
def forgot_password(payload: ForgotPasswordRequest):
    """
    Send a 6-digit reset code to the user's registered email.

    Security:
    - 60-second cooldown between requests (per email)
    - Reset code stored as SHA-256 hash with 15-min TTL
    - Always returns { sent: true } — no user enumeration
    - DEV mode: code logged to server console (no SMTP required)
    """
    email = payload.email.lower()

    # ── Cooldown: max 1 request per 60s per email ────────────────
    now_ts = time.time()
    last = _reset_requests.get(email, 0)
    if now_ts - last < 60:
        wait = int(60 - (now_ts - last))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {wait}s before requesting another reset code.",
        )
    _reset_requests[email] = now_ts

    users_col = database.get_users()
    otps_col  = database.get_otps()
    if users_col is None or otps_col is None:
        # Return success-like response even on DB error — no enumeration
        logger.warning("[Auth] forgot-password: DB unavailable")
        return {"sent": True, "message": "If that email exists, a reset code has been sent."}

    user = users_col.find_one({"email": email}, {"_id": 1, "name": 1})
    if not user:
        # Silent success — no enumeration attack vector
        return {"sent": True, "message": "If that email exists, a reset code has been sent."}

    # Generate 6-digit code + hash it
    plain_code = "".join(random.choices(string.digits, k=6))
    code_hash  = hashlib.sha256(plain_code.encode()).hexdigest()
    expires_at = datetime.utcnow() + timedelta(minutes=_RESET_CODE_TTL_MIN)

    # Store (one active reset per user)
    otps_col.delete_many({"user_id": str(user["_id"]), "type": "password_reset"})
    otps_col.insert_one({
        "user_id": str(user["_id"]),
        "email": email,
        "type": "password_reset",
        "code_hash": code_hash,
        "attempts": 0,
        "created_at": datetime.utcnow(),
        "expires_at": expires_at,
    })

    _send_reset_email(email, plain_code, name=user.get("name", "User"))
    return {"sent": True, "message": "If that email exists, a reset code has been sent."}


# ─── Reset Password ───────────────────────────────────────────────────────────

@router.post("/reset-password", summary="Reset password using the emailed code")
def reset_password(payload: ResetPasswordRequest):
    """
    Verify reset code and update password.

    Security:
    - Code verified against SHA-256 hash (never stored in plain text)
    - Expires after 15 minutes
    - Max 3 wrong attempts before invalidation
    - Token deleted on success
    """
    email    = payload.email.lower()
    users_col = database.get_users()
    otps_col  = database.get_otps()
    if users_col is None or otps_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    reset_doc = otps_col.find_one({"email": email, "type": "password_reset"})
    if not reset_doc:
        raise HTTPException(status_code=400, detail="No active reset code for this email.")

    # TTL check
    if datetime.utcnow() > reset_doc["expires_at"]:
        otps_col.delete_one({"_id": reset_doc["_id"]})
        raise HTTPException(status_code=400, detail="Reset code has expired. Please request a new one.")

    # Brute-force check
    if reset_doc.get("attempts", 0) >= _RESET_MAX_ATTEMPTS:
        otps_col.delete_one({"_id": reset_doc["_id"]})
        raise HTTPException(status_code=400, detail="Too many incorrect attempts. Please request a new reset code.")

    # Code verification
    submitted_hash = hashlib.sha256(payload.reset_code.encode()).hexdigest()
    if submitted_hash != reset_doc["code_hash"]:
        otps_col.update_one({"_id": reset_doc["_id"]}, {"$inc": {"attempts": 1}})
        remaining = _RESET_MAX_ATTEMPTS - reset_doc.get("attempts", 0) - 1
        raise HTTPException(
            status_code=400,
            detail=f"Invalid reset code. {remaining} attempt(s) remaining.",
        )

    # ── Update password ──────────────────────────────────────────
    new_hash = hash_password(payload.new_password)
    users_col.update_one(
        {"_id": ObjectId(reset_doc["user_id"])},
        {"$set": {"password_hash": new_hash, "updated_at": datetime.utcnow()}},
    )
    otps_col.delete_one({"_id": reset_doc["_id"]})
    # Clear cooldown
    _reset_requests.pop(email, None)

    logger.info(f"[Auth] Password reset successful for {email}")
    return {"reset": True, "message": "Password updated successfully. Please log in."}


# ─── Session Info ─────────────────────────────────────────────────────────────

@router.get("/me/session", response_model=SessionInfoResponse, summary="Current user session info")
def get_session_info(current_user: TokenData = Depends(get_current_user)):
    """Returns current user's session metadata — for profile security section."""
    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    user = users_col.find_one(
        {"_id": ObjectId(current_user.user_id)},
        {"email": 1, "role": 1, "patient_id": 1, "phone": 1, "phone_verified": 1,
         "specialization": 1, "last_login_at": 1, "login_count": 1, "created_at": 1},
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    return SessionInfoResponse(
        user_id=current_user.user_id,
        email=user.get("email", ""),
        role=user.get("role", "patient"),
        patient_id=user.get("patient_id"),
        phone=user.get("phone"),
        phone_verified=user.get("phone_verified", False),
        specialization=user.get("specialization"),
        last_login_at=user.get("last_login_at"),
        login_count=user.get("login_count", 0),
        created_at=user.get("created_at"),
    )
