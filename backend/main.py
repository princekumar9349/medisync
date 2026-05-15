"""
main.py — Medisync API Entrypoint (Production-Hardened v3.1)

Hardening changes vs v3.0:
  - validate_production_env() called before app init (crash-fast)
  - Sentry initialized before first request
  - CORS restricted to explicit allowed origins (not wildcard)
  - SCHEDULER_ENABLED guard prevents duplicate APScheduler in Cloud Run replicas
  - JSON logger in production mode
  - Startup validation logs all critical system states

Architecture:
  api/       → FastAPI Routers
  core/      → Config, Event Bus, Logger, Schemas
  workers/   → Background APScheduler jobs
  chatbot/   → Isolated LLM Gateway
  analytics/ → Pre-computed intelligence layer
  services/  → Legacy integration
"""

import logging
import uvicorn
import time
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Core Infrastructure 
from db import database
from core.config import settings, validate_production_env
from core.logger import setup_logger, logging_middleware, get_logger, init_sentry
from core.events.bus import bus
from core.events.types import DomainEvent

# Workers 
from workers.scheduler import start_scheduler, stop_scheduler

# API Domain Routers 
from api import auth, scan, tracking, user, chat, voice, doctor, voice_chat, phone, notifications
from api.health import router as health_router
from analytics.api.routes import router as analytics_router
from api.esp_device import router as esp_router       # IoT/ESP8266

#  Step 1: Validate env before anything else 
# Crash-fast in production if required vars are missing.
validate_production_env()

# Step 2: Setup logger (JSON in production, human-readable in dev) 
setup_logger(is_production=settings.is_production)
logger = get_logger("Main")

# Step 3: Initialize Sentry crash monitoring 
init_sentry(dsn=settings.SENTRY_DSN, env=settings.ENV)


# Lifespan 
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        f"Medisync API starting | env={settings.ENV} | "
        f"scheduler={'enabled' if settings.SCHEDULER_ENABLED else 'disabled'}"
    )

    # 1. MongoDB
    database.connect()

    # 2. Firebase Admin SDK
    from services.firebase_service import initialize_firebase
    initialize_firebase()

    # 3. Scheduler — only if SCHEDULER_ENABLED=true
    # In Cloud Run with multiple replicas, set SCHEDULER_ENABLED=false on API containers
    # and run a dedicated single-instance worker container with SCHEDULER_ENABLED=true.
    if settings.SCHEDULER_ENABLED:
        start_scheduler()
        logger.info("APScheduler started on this instance.")
    else:
        logger.info(
            "APScheduler SKIPPED (SCHEDULER_ENABLED=false). "
            "Ensure a dedicated scheduler container is running."
        )

    # 4. Analytics event bus subscribers
    from analytics.aggregators.adherence import on_dose_event, on_escalation_event
    from analytics.aggregators.ai_metrics import on_ai_response

    bus.subscribe(DomainEvent.DOSE_TAKEN,            on_dose_event)
    bus.subscribe(DomainEvent.DOSE_MISSED,           on_dose_event)
    bus.subscribe(DomainEvent.DOSE_SKIPPED,          on_dose_event)
    bus.subscribe(DomainEvent.ESCALATION_TRIGGERED,  on_escalation_event)
    bus.subscribe(DomainEvent.AI_RESPONSE_GENERATED, on_ai_response)

    logger.info("Analytics event bus subscribers registered.")
    logger.info("✅ Medisync API is ready.")

    yield

    # Shutdown
    logger.info("Medisync API shutting down...")
    if settings.SCHEDULER_ENABLED:
        stop_scheduler()
    logger.info("Shutdown complete.")


# FastAPI App 
app = FastAPI(
    title="Medisync API",
    description="Intelligent Medication Adherence System — Modular Monolith Architecture.",
    version="3.1.0",
    lifespan=lifespan,
    # Hide docs in production to reduce attack surface
    docs_url="/docs"   if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    openapi_url="/openapi.json" if not settings.is_production else None,
)

# CORS 
# Production: use explicit origins from CORS_ORIGINS env var.
# Development/staging: wildcard is acceptable.
cors_origins = settings.cors_origins_list
logger.info(f"CORS origins: {cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

# Request Logging Middleware 
app.middleware("http")(logging_middleware)


@app.middleware("http")
async def metrics_and_error_middleware(request: Request, call_next):
    """Logs latency for every request and captures uncaught exceptions to Sentry."""
    start_time = time.time()
    try:
        response = await call_next(request)
        duration = time.time() - start_time
        # Log slow requests (> 2 seconds) as warnings
        log_fn = logger.warning if duration > 2.0 else logger.info
        log_fn(
            f"{request.method} {request.url.path} "
            f"→ {response.status_code} [{duration*1000:.0f}ms]"
        )
        return response
    except Exception as exc:
        duration = time.time() - start_time
        logger.error(
            f"UNHANDLED: {request.method} {request.url.path} "
            f"[{duration*1000:.0f}ms] — {type(exc).__name__}: {exc}"
        )
        logger.error(traceback.format_exc())

        # Capture to Sentry
        try:
            import sentry_sdk  # type: ignore
            sentry_sdk.capture_exception(exc)
        except Exception:
            pass

        return JSONResponse(
            status_code=500,
            content={"detail": "Internal Server Error"}
        )


# Mount Routers 
app.include_router(health_router)       # /health, /ready
app.include_router(auth.router)         # /auth/*
app.include_router(scan.router)         # /scan
app.include_router(tracking.router)     # /mark-done, /expired, /pillbox
app.include_router(user.router)         # /me, /insights
app.include_router(chat.router)         # /chat
app.include_router(doctor.router)       # /doctor/*
app.include_router(voice.router)        # /voice-reminder, /notify
app.include_router(voice_chat.router)   # /voice-chat/stream
app.include_router(phone.router)        # /phone/*
app.include_router(notifications.router)
app.include_router(analytics_router)    # /analytics/*
app.include_router(esp_router)          # /device/* (ESP8266 IoT)

from voice_ai import router as voice_ai_router
app.include_router(voice_ai_router, prefix="/voice-ai")

from api.voice_assistant import router as va_router
app.include_router(va_router)           # /voice-ai/process (MEDISYNC CORE AI)



@app.get("/", tags=["System"], summary="API root")
def root():
    return {
        "service": "Medisync API",
        "version": "3.1.0",
        "env":     settings.ENV,
        "health":  "/health",
        "ready":   "/ready",
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=not settings.is_production,
        log_level="info",
        access_log=not settings.is_production,  # Cloud Logging handles access logs in prod
    )
