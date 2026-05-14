"""
analytics/trends/weekly.py

Builds 7-day and 30-day daily adherence trend series.
Returns chart-ready data: list of {date, score, taken, missed, status} dicts.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from db import database

logger = logging.getLogger("Medisync.Analytics.Trends")


def build_weekly_trend(user_id: str, days: int = 7, now: Optional[datetime] = None) -> list[dict]:
    """
    Returns a list of daily adherence data points for the last `days` days.
    Each point contains:
        date       : "YYYY-MM-DD" string
        taken      : int
        missed     : int
        skipped    : int
        score_pct  : float   (0–100)
        status     : "excellent" | "good" | "fair" | "poor" | "no_data"
    """
    if now is None:
        now = datetime.utcnow()

    dose_logs_col = database.get_dose_logs()
    if dose_logs_col is None:
        return []

    window_start = now - timedelta(days=days)
    logs = list(dose_logs_col.find(
        {
            "user_id": user_id,
            "timestamp": {"$gte": window_start},
            "status": {"$in": ["taken", "missed", "skipped"]}
        },
        {"status": 1, "timestamp": 1}
    ))

    # Index by date
    daily: dict[str, dict] = {}
    for log in logs:
        day = log["timestamp"].strftime("%Y-%m-%d")
        if day not in daily:
            daily[day] = {"taken": 0, "missed": 0, "skipped": 0}
        daily[day][log["status"]] = daily[day].get(log["status"], 0) + 1

    result = []
    for i in range(days):
        date = (now - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
        d = daily.get(date, {})
        taken   = d.get("taken", 0)
        missed  = d.get("missed", 0)
        skipped = d.get("skipped", 0)
        total   = taken + missed + skipped

        if total == 0:
            score_pct = None
            status = "no_data"
        else:
            score_pct = round((taken / total) * 100, 1)
            if score_pct >= 95:
                status = "excellent"
            elif score_pct >= 80:
                status = "good"
            elif score_pct >= 60:
                status = "fair"
            else:
                status = "poor"

        result.append({
            "date":      date,
            "taken":     taken,
            "missed":    missed,
            "skipped":   skipped,
            "score_pct": score_pct,
            "status":    status,
        })

    return result
