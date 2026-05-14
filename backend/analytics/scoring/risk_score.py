"""
analytics/scoring/risk_score.py

Deterministic, weighted risk scoring engine.
Risk levels: LOW / MODERATE / HIGH / CRITICAL
No ML — fully auditable and explainable.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from db import database

logger = logging.getLogger("Medisync.Analytics.RiskScore")

# Risk threshold → score boundaries
RISK_THRESHOLDS = {
    "CRITICAL":  12,
    "HIGH":       8,
    "MODERATE":   4,
    "LOW":        0,
}


def compute_risk_score(user_id: str, now: Optional[datetime] = None) -> dict:
    """
    Computes a deterministic risk score using a weighted factor table.

    Factors:
      - Missed doses in the last 7 days
      - Adherence % in the last 7 days (inverse)
      - Escalation events in the last 7 days
      - Number of distinct critical medications missed (any day)
      - Caregiver interventions in the last 7 days

    Returns:
        {
            "level": "LOW" | "MODERATE" | "HIGH" | "CRITICAL",
            "score": int,
            "factors": [str, ...],   # human-readable reasons
            "computed_at": datetime,
        }
    """
    if now is None:
        now = datetime.utcnow()

    dose_logs_col = database.get_dose_logs()
    if dose_logs_col is None:
        return _unavailable_risk()

    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)
    score = 0
    factors = []

    # ── Factor 1: Missed doses in 7 days ─────────────────────────────────────
    missed_7d = dose_logs_col.count_documents({
        "user_id": user_id,
        "status": "missed",
        "timestamp": {"$gte": seven_days_ago}
    })
    if missed_7d >= 5:
        pts = 4; factors.append(f"Critical: {missed_7d} missed doses in 7 days")
    elif missed_7d >= 3:
        pts = 3; factors.append(f"High: {missed_7d} missed doses in 7 days")
    elif missed_7d >= 1:
        pts = 1; factors.append(f"{missed_7d} missed doses in 7 days")
    else:
        pts = 0
    score += pts

    # ── Factor 2: 30-day adherence rate (inverse risk) ────────────────────────
    taken_30d = dose_logs_col.count_documents({
        "user_id": user_id,
        "status": "taken",
        "timestamp": {"$gte": thirty_days_ago}
    })
    total_30d = dose_logs_col.count_documents({
        "user_id": user_id,
        "status": {"$in": ["taken", "missed", "skipped"]},
        "timestamp": {"$gte": thirty_days_ago}
    })
    if total_30d > 0:
        adherence_30d_pct = (taken_30d / total_30d) * 100
        if adherence_30d_pct < 50:
            pts = 4; factors.append(f"Very low 30-day adherence: {adherence_30d_pct:.0f}%")
        elif adherence_30d_pct < 75:
            pts = 2; factors.append(f"Below-average 30-day adherence: {adherence_30d_pct:.0f}%")
        elif adherence_30d_pct < 90:
            pts = 1; factors.append(f"Moderate 30-day adherence: {adherence_30d_pct:.0f}%")
        else:
            pts = 0
        score += pts

    # ── Factor 3: Escalation events in 7 days ────────────────────────────────
    # We approximate this by counting escalated/missed entries in dose_logs
    escalations_7d = dose_logs_col.count_documents({
        "user_id": user_id,
        "status": {"$in": ["escalated_caregiver", "escalated_ai_call"]},
        "timestamp": {"$gte": seven_days_ago}
    })
    if escalations_7d >= 4:
        pts = 4; factors.append(f"Critical: {escalations_7d} caregiver escalations in 7 days")
    elif escalations_7d >= 2:
        pts = 2; factors.append(f"{escalations_7d} caregiver escalations in 7 days")
    elif escalations_7d == 1:
        pts = 1; factors.append("1 caregiver escalation this week")
    else:
        pts = 0
    score += pts

    # ── Factor 4: Critical medication missed ─────────────────────────────────
    # Prescriptions collection may have priority field
    prescriptions_col = database.get_prescriptions()
    if prescriptions_col is not None:
        critical_prescriptions = list(prescriptions_col.find(
            {"user_id": user_id},
            {"medicines": 1}
        ))
        critical_med_names = set()
        for rx in critical_prescriptions:
            for med in rx.get("medicines", []):
                if med.get("priority") == "critical":
                    critical_med_names.add(med.get("name", "").lower())

        if critical_med_names:
            critical_missed = dose_logs_col.count_documents({
                "user_id": user_id,
                "medicine_name": {"$in": list(critical_med_names)},
                "status": "missed",
                "timestamp": {"$gte": seven_days_ago}
            })
            if critical_missed >= 2:
                score += 3
                factors.append(f"⚠️ Critical medicine missed {critical_missed}x in 7 days")
            elif critical_missed == 1:
                score += 2
                factors.append("⚠️ Critical medicine missed once this week")

    # ── Compute Level ─────────────────────────────────────────────────────────
    level = "LOW"
    for risk_level, threshold in RISK_THRESHOLDS.items():
        if score >= threshold:
            level = risk_level
            break

    if not factors:
        factors.append("Adherence within normal range")

    return {
        "level": level,
        "score": score,
        "factors": factors,
        "computed_at": now,
        "missed_7d": missed_7d,
        "escalations_7d": escalations_7d,
    }


def _unavailable_risk() -> dict:
    return {
        "level": "LOW",
        "score": 0,
        "factors": ["Analytics unavailable (DB offline)"],
        "computed_at": datetime.utcnow(),
        "missed_7d": 0,
        "escalations_7d": 0,
    }
