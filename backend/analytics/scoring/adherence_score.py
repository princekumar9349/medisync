"""
analytics/scoring/adherence_score.py

Deterministic adherence scoring engine.
Reads dose_logs from MongoDB for a given user and time window.
All computations are pure math — no ML, no black boxes.
"""

import logging
import math
from datetime import datetime, timedelta
from typing import Optional
from db import database

logger = logging.getLogger("Medisync.Analytics.AdherenceScore")


def _get_daily_rates(user_id: str, days: int, now: datetime) -> list[float]:
    """
    For each day in the window, compute the adherence rate (0.0 – 1.0).
    Returns a list of per-day rates (most recent last).
    """
    dose_logs_col = database.get_dose_logs()
    prescriptions_col = database.get_prescriptions()
    if dose_logs_col is None or prescriptions_col is None:
        return []

    window_start = now - timedelta(days=days)

    # Fetch all dose logs in window (projection only)
    logs = list(dose_logs_col.find(
        {"user_id": user_id, "timestamp": {"$gte": window_start}},
        {"status": 1, "timestamp": 1, "note": 1, "medicine_name": 1}
    ))

    if not logs:
        return []

    # Group by calendar day
    daily_taken: dict[str, int] = {}
    daily_total: dict[str, int] = {}

    for log in logs:
        day_key = log["timestamp"].strftime("%Y-%m-%d")
        status = log.get("status", "")
        if status == "taken":
            daily_taken[day_key] = daily_taken.get(day_key, 0) + 1
        if status in ("taken", "missed", "skipped"):
            daily_total[day_key] = daily_total.get(day_key, 0) + 1

    rates = []
    for day_key, total in daily_total.items():
        taken = daily_taken.get(day_key, 0)
        rates.append(taken / total if total > 0 else 0.0)

    return rates


def compute_adherence_score(user_id: str, window_days: int = 7, now: Optional[datetime] = None) -> dict:
    """
    Returns a rich adherence score object for the given user and time window.
    
    Returns:
        {
            "score_pct": float,         # 0–100 adherence percentage
            "consistency_score": float, # 0.0–1.0 (1.0 = perfectly consistent daily adherence)
            "streak_current": int,      # consecutive days of 100% adherence ending today
            "streak_longest": int,      # best streak in the window
            "confidence": str,          # HIGH / MEDIUM / LOW (based on data availability)
            "days_computed": int,       # number of days with data
        }
    """
    if now is None:
        now = datetime.utcnow()

    dose_logs_col = database.get_dose_logs()
    if dose_logs_col is None:
        return _empty_score()

    window_start = now - timedelta(days=window_days)

    taken_count = dose_logs_col.count_documents({
        "user_id": user_id,
        "status": "taken",
        "timestamp": {"$gte": window_start}
    })
    total_count = dose_logs_col.count_documents({
        "user_id": user_id,
        "status": {"$in": ["taken", "missed", "skipped"]},
        "timestamp": {"$gte": window_start}
    })

    if total_count == 0:
        return _empty_score()

    score_pct = round((taken_count / total_count) * 100, 1)

    # Consistency score — lower std dev = higher consistency
    daily_rates = _get_daily_rates(user_id, window_days, now)
    consistency_score = _compute_consistency(daily_rates)

    # Streak analysis
    streak_current, streak_longest = _compute_streaks(daily_rates)

    # Confidence based on data availability
    days_with_data = len(daily_rates)
    if days_with_data >= 14:
        confidence = "HIGH"
    elif days_with_data >= 5:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    return {
        "score_pct": score_pct,
        "consistency_score": round(consistency_score, 3),
        "streak_current": streak_current,
        "streak_longest": streak_longest,
        "confidence": confidence,
        "days_computed": days_with_data,
        "taken": taken_count,
        "total": total_count,
    }


def _compute_consistency(rates: list[float]) -> float:
    """Returns 1 - (normalized stddev). 1.0 = perfectly consistent, 0.0 = chaotic."""
    if len(rates) < 2:
        return 1.0 if (rates and rates[0] == 1.0) else 0.0
    mean = sum(rates) / len(rates)
    variance = sum((r - mean) ** 2 for r in rates) / len(rates)
    std_dev = math.sqrt(variance)
    # Normalize stddev (max possible is 0.5 for binary 0/1 distribution)
    return round(max(0.0, 1.0 - (std_dev / 0.5)), 3)


def _compute_streaks(daily_rates: list[float]) -> tuple[int, int]:
    """
    Computes current and longest 100% adherence streaks.
    'Current' = consecutive 1.0 days ending at the last entry.
    """
    streak_current = 0
    streak_longest = 0
    running = 0

    for rate in daily_rates:
        if rate == 1.0:
            running += 1
            streak_longest = max(streak_longest, running)
        else:
            running = 0

    # Current streak: count from the end backwards
    for rate in reversed(daily_rates):
        if rate == 1.0:
            streak_current += 1
        else:
            break

    return streak_current, streak_longest


def _empty_score() -> dict:
    return {
        "score_pct": 0.0,
        "consistency_score": 0.0,
        "streak_current": 0,
        "streak_longest": 0,
        "confidence": "LOW",
        "days_computed": 0,
        "taken": 0,
        "total": 0,
    }
