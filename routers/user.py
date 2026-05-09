"""
routers/user.py — User profile and prescription history endpoints for Medisync.

Routes:
  GET /me                  — Current user profile          [PROTECTED]
  GET /user-prescriptions  — User's prescription history   [PROTECTED]
  GET /insights            — Adherence analysis report     [PROTECTED]
"""

import logging
from datetime import datetime, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from db import database
from db import database
from models.schemas import TokenData, UserUpdate
from services.auth_service import get_current_user
from services.insights_service import analyze_adherence

logger = logging.getLogger("Medisync.User")
router = APIRouter(tags=["User"])


# ─── Helper ───────────────────────────────────────────────────────────────────

def _serialize(doc: dict) -> dict:
    """Convert MongoDB ObjectId fields to strings for JSON serialization."""
    doc["_id"] = str(doc["_id"])
    return doc


# ─── GET /me ──────────────────────────────────────────────────────────────────

@router.get(
    "/me",
    summary="Get current authenticated user's profile",
)
def get_profile(current_user: TokenData = Depends(get_current_user)):
    """
    Returns the authenticated user's profile information.
    Password hash is never included in the response.
    """
    users_col = database.get_users()

    if users_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    try:
        user = users_col.find_one(
            {"_id": ObjectId(current_user.user_id)},
            {"password_hash": 0}   # exclude password hash
        )
    except Exception as e:
        logger.error(f"Error fetching user profile: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    return {
        "user_id": str(user["_id"]),
        "patient_id": user.get("patient_id"),
        "name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role", "patient"),
        "age": user.get("age"),
        "gender": user.get("gender"),
        "weight": user.get("weight"),
        "blood_group": user.get("blood_group"),
        "created_at": user.get("created_at"),
    }

@router.put(
    "/me",
    summary="Update current user's profile (Onboarding)",
)
def update_profile(payload: UserUpdate, current_user: TokenData = Depends(get_current_user)):
    """
    Updates the authenticated user's profile information.
    Used for onboarding.
    """
    users_col = database.get_users()

    if users_col is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return {"message": "No data to update."}
        
    update_data["updated_at"] = datetime.utcnow()

    users_col.update_one(
        {"_id": ObjectId(current_user.user_id)},
        {"$set": update_data}
    )

    return {"message": "Profile updated successfully"}


# ─── GET /user-prescriptions ──────────────────────────────────────────────────

@router.get(
    "/user-prescriptions",
    summary="Fetch all prescriptions for the current user",
)
def get_prescriptions(
    limit: int = 20,
    skip: int = 0,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Returns the authenticated user's prescription history, sorted newest first.

    Query params:
      - limit: max records to return (default 20, max 100)
      - skip:  pagination offset (default 0)
    """
    prescriptions_col = database.get_prescriptions()

    if prescriptions_col is None:
        return {
            "prescriptions": [],
            "total": 0,
            "warning": "Database unavailable — no history stored.",
        }

    try:
        # Clamp limit to avoid huge responses
        limit = min(limit, 100)

        cursor = (
            prescriptions_col
            .find({"user_id": current_user.user_id}, {"_id": 1, "medicines": 1, "schedule": 1, "doctor_advice": 1, "possible_condition": 1, "precautions": 1, "created_at": 1})
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )

        prescriptions = [_serialize(doc) for doc in cursor]
        total = prescriptions_col.count_documents({"user_id": current_user.user_id})

        logger.info(
            f"📋 Returning {len(prescriptions)}/{total} prescriptions "
            f"for user {current_user.user_id[:8]}..."
        )

        return {
            "prescriptions": prescriptions,
            "total": total,
            "limit": limit,
            "skip": skip,
        }

    except Exception as db_err:
        logger.error(f"Error fetching prescriptions: {db_err}")
        return {"prescriptions": [], "total": 0, "warning": str(db_err)}


# ─── GET /insights ────────────────────────────────────────────────────────────

@router.get(
    "/insights",
    summary="Get AI-generated adherence insights for the current user",
)
def get_insights(current_user: TokenData = Depends(get_current_user)):
    """
    Analyze the user's dose logs and return an adherence report including:
      - adherence_rate (0.0 – 1.0)
      - risk_level: 'low' | 'medium' | 'high'
      - recommendations (list of actionable suggestions)
      - dose counts: expected / taken / missed
    """
    report = analyze_adherence(current_user.user_id)
    return report.model_dump()


# ─── GET /adherence/weekly ────────────────────────────────────────────────────

@router.get(
    "/adherence/weekly",
    summary="Get 7-day daily adherence chart data for the current patient",
)
def get_weekly_adherence(current_user: TokenData = Depends(get_current_user)):
    """
    Returns a 7-day breakdown of daily adherence percentages suitable for
    rendering a bar chart on the patient dashboard.

    Response:
      {
        "labels": ["Mon", "Tue", ...],
        "taken":  [3, 2, ...],
        "missed": [1, 0, ...],
        "percentages": [75, 100, ...]
      }
    """
    dose_logs_col = database.get_dose_logs()
    if dose_logs_col is None:
        return {"labels": [], "taken": [], "missed": [], "percentages": []}

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    seven_days_ago = today - timedelta(days=6)

    logs = list(dose_logs_col.find({
        "user_id": current_user.user_id,
        "timestamp": {"$gte": seven_days_ago},
        "status": {"$in": ["taken", "missed", "skipped"]}
    }))

    # Build per-day stats
    daily = {}
    for i in range(7):
        dt = today - timedelta(days=6 - i)
        key = dt.strftime("%a")
        daily[key] = {"taken": 0, "missed": 0, "date": dt}

    for log in logs:
        ts = log.get("timestamp")
        if not ts:
            continue
        day_key = ts.strftime("%a")
        if day_key not in daily:
            continue
        st = log.get("status", "")
        if st == "taken":
            daily[day_key]["taken"] += 1
        elif st in ("missed", "skipped"):
            daily[day_key]["missed"] += 1

    labels, taken_list, missed_list, pcts = [], [], [], []
    for key, val in daily.items():
        labels.append(key)
        t = val["taken"]
        m = val["missed"]
        taken_list.append(t)
        missed_list.append(m)
        total = t + m
        pcts.append(round((t / total) * 100) if total > 0 else 0)

    return {
        "labels": labels,
        "taken": taken_list,
        "missed": missed_list,
        "percentages": pcts,
    }


# ─── Push Token Registration ──────────────────────────────────────────────────

@router.post(
    "/register-push-token",
    summary="Register Expo push notification token for current user",
)
def register_push_token(
    payload: dict,
    current_user: TokenData = Depends(get_current_user),
):
    """Store the user's Expo push token so the scheduler can send real-time alerts."""
    token = payload.get("expo_push_token", "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="expo_push_token is required.")

    users_col = database.get_users()
    if users_col is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    from bson import ObjectId
    users_col.update_one(
        {"_id": ObjectId(current_user.user_id)},
        {"$set": {"expo_push_token": token, "push_token_updated_at": datetime.utcnow()}}
    )
    logger.info(f"🔔 Push token registered for user {current_user.user_id[:8]}...")
    return {"message": "Push token registered successfully."}

