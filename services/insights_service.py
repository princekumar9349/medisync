"""
services/insights_service.py — AI Adherence Analytics for Medisync.

Provides:
  - analyze_adherence(): Compute adherence metrics for a user
  - _generate_recommendations(): Rule-based + AI recommendations
  - save_insight(): Persist report to MongoDB insights collection
"""

import logging
from datetime import datetime, timedelta
from typing import List

from db import database
from models.schemas import InsightReport

logger = logging.getLogger("Medisync.Insights")


# ─── Public API ───────────────────────────────────────────────────────────────

def analyze_adherence(user_id: str) -> InsightReport:
    """
    Analyze medication adherence for the given user.

    Steps:
      1. Fetch all dose_logs for user from last 30 days
      2. Count taken / missed / skipped events
      3. Detect consecutive missed doses (irregular behavior signal)
      4. Compute adherence rate (taken / total)
      5. Assign risk level: low / medium / high
      6. Generate recommendations
      7. Persist insight to DB and return InsightReport

    Args:
        user_id: The authenticated user's ID string

    Returns:
        InsightReport model with full analysis
    """
    dose_logs_col = database.get_dose_logs()
    insights_col = database.get_insights()

    report = InsightReport(user_id=user_id)

    if dose_logs_col is None:
        logger.warning("MongoDB unavailable — returning default insight report.")
        report.recommendations = ["Connect to database to enable adherence tracking."]
        return report

    # ── 1. Fetch logs from last 30 days ───────────────────────────
    cutoff = datetime.utcnow() - timedelta(days=30)
    logs = list(
        dose_logs_col.find(
            {"user_id": user_id, "timestamp": {"$gte": cutoff}},
            {"_id": 0}
        ).sort("timestamp", 1)      # ascending for consecutive-miss detection
    )

    logger.info(f"Analyzing {len(logs)} dose logs for user {user_id[:8]}...")

    # ── 2. Count events ───────────────────────────────────────────
    taken = sum(1 for l in logs if l.get("status") == "taken")
    missed = sum(1 for l in logs if l.get("status") == "missed")
    skipped = sum(1 for l in logs if l.get("status") == "skipped")
    total = taken + missed + skipped

    report.total_doses_taken = taken
    report.total_doses_missed = missed + skipped
    report.total_doses_expected = total

    # ── 3. Adherence rate ─────────────────────────────────────────
    if total > 0:
        report.adherence_rate = round(taken / total, 4)
    else:
        report.adherence_rate = 1.0   # no data = assume compliant

    # ── 4. Consecutive missed doses (irregular behavior) ──────────
    max_consecutive = 0
    current_streak = 0
    for log in logs:
        if log.get("status") in ("missed", "skipped"):
            current_streak += 1
            max_consecutive = max(max_consecutive, current_streak)
        else:
            current_streak = 0

    report.consecutive_misses = max_consecutive

    # ── 5. Risk level ─────────────────────────────────────────────
    if report.adherence_rate >= 0.85 and max_consecutive < 2:
        report.risk_level = "low"
    elif report.adherence_rate >= 0.60 or max_consecutive < 4:
        report.risk_level = "medium"
    else:
        report.risk_level = "high"

    # ── 6. Recommendations ────────────────────────────────────────
    report.recommendations = _generate_recommendations(report)

    # ── 7. Persist ────────────────────────────────────────────────
    if insights_col is not None:
        try:
            doc = report.model_dump()
            insights_col.update_one(
                {"user_id": user_id},
                {"$set": doc},
                upsert=True
            )
            logger.info(f" Insight report saved for user {user_id[:8]}...")
        except Exception as db_err:
            logger.warning(f"Could not save insight: {db_err}")

    return report


def _generate_recommendations(report: InsightReport) -> List[str]:
    """
    Generate actionable, personalized recommendations based on adherence metrics.

    Args:
        report: Partially filled InsightReport

    Returns:
        List of recommendation strings
    """
    recs = []
    rate = report.adherence_rate
    risk = report.risk_level
    consecutive = report.consecutive_misses

    # ── Rate-based advice ─────────────────────────────────────────
    if rate >= 0.90:
        recs.append("Excellent adherence! Keep up the great work.")
    elif rate >= 0.75:
        recs.append("Good adherence. Try to take your medicines at the same time each day.")
    elif rate >= 0.50:
        recs.append("Moderate adherence. Set phone reminders to improve consistency.")
    else:
        recs.append("Low adherence detected. Missing doses can reduce treatment effectiveness.")

    # ── Consecutive-miss advice ───────────────────────────────────
    if consecutive >= 3:
        recs.append(
            f"You have missed {consecutive} doses in a row. "
            "Please take your next dose and inform your doctor."
        )
    elif consecutive == 2:
        recs.append("You've missed 2 doses in a row. Try not to skip again today.")

    # ── Risk-level advice ─────────────────────────────────────────
    if risk == "high":
        recs.append("High risk level: Please contact your doctor or caregiver immediately.")
    elif risk == "medium":
        recs.append(
            "Consider enabling daily reminders and asking a family member "
            "to help remind you."
        )

    # ── Generic healthy habit tips ────────────────────────────────
    if report.total_doses_expected == 0:
        recs.append("No dose logs found yet. Start marking your doses after taking them.")
    else:
        recs.append("Drink a full glass of water when taking your medicines.")

    return recs
