"""
api/health.py — Production-hardened liveness + readiness probes.

CHANGES vs v1:
  - /health: unchanged (pure liveness, zero deps)
  - /ready:  expanded to check MongoDB, scheduler, AI gateway, Firebase
  - Correct HTTP 503 on any critical component failure
  - Never blocks more than 3 seconds total
"""

import time
import logging
from fastapi import APIRouter, Response, status
from core.config import settings

router = APIRouter(tags=["System Observability"])
START_TIME = time.time()
logger = logging.getLogger("Medisync.Health")


@router.get("/health", summary="Liveness probe — lightweight heartbeat")
def health_check():
    """
    Used by Cloud Run as the liveness probe.
    Must respond in < 100ms. Checks ONLY that the process is alive.
    No external dependencies checked here.
    """
    return {
        "status": "ok",
        "version": "3.0.0",
        "env":     settings.ENV,
        "uptime_seconds": round(time.time() - START_TIME),
    }


@router.get("/ready", summary="Readiness probe — full dependency check")
def readiness_check(response: Response):
    """
    Used by Cloud Run as the readiness probe and by monitoring systems.
    Checks all critical dependencies. Returns 503 if any are failing.

    Components checked:
      - MongoDB connectivity
      - APScheduler running state
      - AI Gateway (Gemini key configured)
      - Firebase credentials on disk
    """
    checks: dict[str, str] = {}
    all_ready = True

    # ── 1. MongoDB ────────────────────────────────────────────────────────────
    try:
        from db import database
        mongo_ok = database.ping()
        checks["mongodb"] = "connected" if mongo_ok else "disconnected"
        if not mongo_ok:
            all_ready = False
    except Exception as e:
        checks["mongodb"] = f"error: {str(e)[:60]}"
        all_ready = False

    # ── 2. APScheduler ────────────────────────────────────────────────────────
    try:
        if settings.SCHEDULER_ENABLED:
            from workers.scheduler import _scheduler
            sched_ok = _scheduler.running
            checks["scheduler"] = "running" if sched_ok else "stopped"
            if not sched_ok:
                all_ready = False
                logger.warning("Readiness: APScheduler not running!")
        else:
            checks["scheduler"] = "disabled (env SCHEDULER_ENABLED=false)"
    except Exception as e:
        checks["scheduler"] = f"error: {str(e)[:60]}"
        all_ready = False

    # ── 3. AI Gateway ─────────────────────────────────────────────────────────
    try:
        gemini_key = bool(settings.GEMINI_API_KEY)
        groq_key   = bool(settings.GROQ_API_KEY)
        if gemini_key or groq_key:
            checks["ai_gateway"] = (
                f"primary={'gemini' if gemini_key else 'none'}, "
                f"fallback={'groq' if groq_key else 'none'}"
            )
        else:
            checks["ai_gateway"] = "degraded (no AI keys configured)"
            # Not marked as all_ready=False because local fallback handles this
    except Exception as e:
        checks["ai_gateway"] = f"error: {str(e)[:60]}"

    # ── 4. Firebase / FCM ─────────────────────────────────────────────────────
    try:
        import os
        creds_path = settings.FIREBASE_CREDENTIALS
        firebase_ok = os.path.isfile(creds_path)
        checks["firebase"] = "credentials_found" if firebase_ok else "credentials_missing"
        if not firebase_ok:
            # Firebase missing = push notifications will fail, but not a hard blocker for API
            logger.warning(f"Readiness: Firebase credentials not found at {creds_path}")
    except Exception as e:
        checks["firebase"] = f"error: {str(e)[:60]}"

    # ── 5. Analytics Snapshot Collection ──────────────────────────────────────
    try:
        from db import database
        snap_col = database.get_analytics_snapshots()
        checks["analytics"] = "ready" if snap_col is not None else "unavailable"
    except Exception as e:
        checks["analytics"] = f"error: {str(e)[:60]}"

    # ── Response ──────────────────────────────────────────────────────────────
    if not all_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if all_ready else "unavailable",
        "checks": checks,
        "uptime_seconds": round(time.time() - START_TIME),
        "env": settings.ENV,
    }
