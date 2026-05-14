"""
analytics/api/routes.py

FastAPI router for all /analytics/* endpoints.
DESIGN PRINCIPLE: APIs only READ from pre-computed snapshots.
No on-demand computation happens inside request handlers.
"""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from bson import ObjectId

from services.auth_service import get_current_user
from db import database
from analytics.snapshots.manager import refresh_user_snapshot
from analytics.trends.weekly import build_weekly_trend
from analytics.timelines.patient import get_patient_timeline
from analytics.aggregators.ai_metrics import get_ai_summary
from analytics.schemas.models import (
    UserAnalyticsSummary,
    TrendDataPoint,
    TimelineEvent,
    AIMetricsSummary,
    DoctorPatientRiskItem,
)

logger = logging.getLogger("Medisync.Analytics.API")

router = APIRouter(prefix="/analytics", tags=["Analytics"])

# ── In-memory API response cache ─────────────────────────────────────────────
_api_cache: dict = {}
_API_CACHE_TTL_SEC = 300  # 5 minutes

def _get_cached(key: str):
    entry = _api_cache.get(key)
    if entry and (datetime.utcnow() - entry["ts"]).seconds < _API_CACHE_TTL_SEC:
        return entry["data"]
    return None

def _set_cached(key: str, data):
    _api_cache[key] = {"data": data, "ts": datetime.utcnow()}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _snapshot_to_response(snap: dict) -> dict:
    """Converts a raw MongoDB snapshot document into an API-safe response dict."""
    updated_at = snap.get("updated_at")
    return {
        "adherence":    snap.get("adherence", {}),
        "risk":         snap.get("risk", {}),
        "notification": snap.get("notification", {}),
        "caregiver":    snap.get("caregiver", {}),
        "updated_at":   updated_at.isoformat() + "Z" if isinstance(updated_at, datetime) else None,
    }


# ── Patient Endpoints ─────────────────────────────────────────────────────────

@router.get("/me/summary", summary="My analytics summary (adherence + risk)")
def get_my_analytics_summary(current_user: dict = Depends(get_current_user)):
    """
    Returns the pre-computed analytics snapshot for the authenticated patient.
    Falls back to triggering a fresh compute if no snapshot exists yet.
    """
    user_id = str(current_user["_id"])
    cache_key = f"summary:{user_id}"

    # API-level cache check
    cached = _get_cached(cache_key)
    if cached:
        return cached

    col = database.get_analytics_snapshots()
    if col is None:
        raise HTTPException(status_code=503, detail="Analytics unavailable")

    snap = col.find_one({"user_id": user_id}, {"_id": 0})
    if snap is None:
        # First-time user: compute on demand (this is the one exception to the "no on-demand" rule)
        logger.info(f"No snapshot found for user {user_id[:8]} — computing on demand.")
        snap = refresh_user_snapshot(user_id, force=True)
        if snap is None:
            raise HTTPException(status_code=503, detail="Unable to compute analytics")

    response = _snapshot_to_response(snap)
    _set_cached(cache_key, response)
    return response


@router.get("/me/trends", summary="My 7-day or 30-day daily adherence trend")
def get_my_trends(
    days: int = Query(default=7, ge=7, le=30),
    current_user: dict = Depends(get_current_user),
):
    """Returns daily adherence breakdown for charting (e.g., bar graph or heatmap)."""
    user_id = str(current_user["_id"])
    cache_key = f"trends:{user_id}:{days}"

    cached = _get_cached(cache_key)
    if cached:
        return cached

    trend_data = build_weekly_trend(user_id, days=days)
    _set_cached(cache_key, trend_data)
    return trend_data


@router.get("/me/timeline", summary="My chronological event timeline (cursor-paginated)")
def get_my_timeline(
    limit: int = Query(default=30, ge=1, le=100),
    before: Optional[str] = Query(default=None, description="ISO timestamp cursor from previous page's next_cursor"),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns cursor-paginated timeline events.
    Use `next_cursor` from the response as the `before` param in subsequent calls.
    """
    user_id = str(current_user["_id"])
    return get_patient_timeline(user_id, limit=limit, before_cursor=before)


# ── Doctor Endpoints ─────────────────────────────────────────────────────────

@router.get("/doctor/patients", summary="All linked patients, risk-sorted (Doctor only)")
def get_doctor_patients_risk(current_user: dict = Depends(get_current_user)):
    """
    Returns all patients linked to this doctor, sorted by risk score descending.
    ALWAYS reads from precomputed analytics_snapshots — no in-request recompute.
    The risk_ranking compound index makes this a pure index scan.
    """
    if current_user.get("role") not in ("doctor", "admin"):
        raise HTTPException(status_code=403, detail="Doctor or Admin access required")

    doctor_id = str(current_user["_id"])
    cache_key = f"doctor_patients:{doctor_id}"

    cached = _get_cached(cache_key)
    if cached:
        return cached

    users_col = database.get_users()
    snapshots_col = database.get_analytics_snapshots()
    if users_col is None or snapshots_col is None:
        raise HTTPException(status_code=503, detail="Analytics unavailable")

    # Step 1: Collect patient IDs linked to this doctor
    patients = list(users_col.find(
        {"assigned_doctor_id": doctor_id, "role": "patient"},
        {"_id": 1, "name": 1}
    ))
    if not patients:
        return []

    patient_map = {str(p["_id"]): p.get("name", "Unknown") for p in patients}
    patient_ids = list(patient_map.keys())

    # Step 2: Batch-read all snapshots for these patients sorted by risk score
    # Uses the risk_ranking compound index — pure read, no computation
    snaps = list(snapshots_col.find(
        {"user_id": {"$in": patient_ids}},
        {"_id": 0, "user_id": 1, "risk": 1, "adherence": 1}
    ).sort([("risk.score", -1)]))

    result = []
    for snap in snaps:
        pid = snap["user_id"]
        result.append({
            "user_id":        pid,
            "name":           patient_map.get(pid, "Unknown"),
            "adherence_7d":   snap.get("adherence", {}).get("score_7d", 0.0),
            "risk_level":     snap.get("risk", {}).get("level", "LOW"),
            "risk_score":     snap.get("risk", {}).get("score", 0),
            "missed_7d":      snap.get("risk", {}).get("missed_7d", 0),
            "escalations_7d": snap.get("risk", {}).get("escalations_7d", 0),
        })

    _set_cached(cache_key, result)
    return result


@router.get("/doctor/patient/{patient_id}", summary="Full analytics for a specific patient (Doctor only)")
def get_patient_analytics(
    patient_id: str,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") not in ("doctor", "admin"):
        raise HTTPException(status_code=403, detail="Doctor or Admin access required")

    # Validate this doctor is assigned to this patient
    if current_user.get("role") == "doctor":
        users_col = database.get_users()
        if users_col:
            patient = users_col.find_one({
                "_id": ObjectId(patient_id),
                "assigned_doctor_id": str(current_user["_id"])
            })
            if not patient:
                raise HTTPException(status_code=403, detail="Patient not assigned to this doctor")

    col = database.get_analytics_snapshots()
    if col is None:
        raise HTTPException(status_code=503, detail="Analytics unavailable")

    snap = col.find_one({"user_id": patient_id}, {"_id": 0})
    if not snap:
        raise HTTPException(status_code=404, detail="Analytics snapshot not found for this patient")

    return _snapshot_to_response(snap)


# ── Admin Endpoints ───────────────────────────────────────────────────────────

@router.get("/admin/system", summary="System-wide AI + notification metrics (Admin only)")
def get_admin_system_metrics(
    hours: int = Query(default=24, ge=1, le=168),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    cache_key = f"admin_system:{hours}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    ai_summary = get_ai_summary(hours=hours)
    _set_cached(cache_key, ai_summary)
    return ai_summary
