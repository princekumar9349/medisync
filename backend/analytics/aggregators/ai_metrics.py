"""
analytics/aggregators/ai_metrics.py

AI Gateway observability aggregator.
Subscribes to AI_RESPONSE_GENERATED events emitted by chatbot/gateway/router.py.
Writes structured rows to the ai_metrics collection for admin dashboard and future analysis.
"""

import logging
from datetime import datetime
from db import database

logger = logging.getLogger("Medisync.Analytics.AIMetrics")


async def on_ai_response(payload: dict) -> None:
    """
    Async subscriber for AI_RESPONSE_GENERATED events.
    Payload fields:
        provider      : "GEMINI" | "GROQ" | "LOCAL_FALLBACK" | "CACHE"
        category      : "schedule" | "vision" | "general" | "analytics"
        cache_hit     : bool
        fallback_used : bool
        latency_ms    : int
        degraded_mode : bool
        estimated_tokens: int (optional)
    """
    col = database.get_ai_metrics()
    if col is None:
        return

    try:
        col.insert_one({
            "timestamp":        datetime.utcnow(),
            "provider":         payload.get("provider", "UNKNOWN"),
            "category":         payload.get("category", "general"),
            "cache_hit":        bool(payload.get("cache_hit", False)),
            "fallback_used":    bool(payload.get("fallback_used", False)),
            "latency_ms":       int(payload.get("latency_ms", 0)),
            "degraded_mode":    bool(payload.get("degraded_mode", False)),
            "estimated_tokens": payload.get("estimated_tokens"),
        })
    except Exception as e:
        logger.warning(f"AI metrics write failed: {e}")


def get_ai_summary(hours: int = 24) -> dict:
    """
    Returns aggregate AI metrics for the last N hours.
    Used by the Admin Dashboard.
    """
    from datetime import timedelta
    col = database.get_ai_metrics()
    if col is None:
        return _empty_ai_summary()

    since = datetime.utcnow() - timedelta(hours=hours)
    docs = list(col.find({"timestamp": {"$gte": since}}, {"_id": 0}))

    if not docs:
        return _empty_ai_summary()

    total = len(docs)
    cache_hits = sum(1 for d in docs if d.get("cache_hit"))
    fallbacks  = sum(1 for d in docs if d.get("fallback_used"))
    degraded   = sum(1 for d in docs if d.get("degraded_mode"))
    latencies  = [d["latency_ms"] for d in docs if d.get("latency_ms")]
    avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else 0

    # Provider breakdown
    provider_counts: dict[str, int] = {}
    for d in docs:
        p = d.get("provider", "UNKNOWN")
        provider_counts[p] = provider_counts.get(p, 0) + 1

    return {
        "total_requests":    total,
        "cache_hit_rate":    round(cache_hits / total, 3) if total > 0 else 0.0,
        "fallback_rate":     round(fallbacks / total, 3) if total > 0 else 0.0,
        "degraded_rate":     round(degraded / total, 3) if total > 0 else 0.0,
        "avg_latency_ms":    avg_latency,
        "provider_breakdown": provider_counts,
        "window_hours":      hours,
    }


def _empty_ai_summary() -> dict:
    return {
        "total_requests": 0,
        "cache_hit_rate": 0.0,
        "fallback_rate": 0.0,
        "degraded_rate": 0.0,
        "avg_latency_ms": 0,
        "provider_breakdown": {},
        "window_hours": 24,
    }
