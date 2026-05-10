"""
main.py — Medisync API Entrypoint

Production-ready FastAPI application for intelligent medication adherence.

Architecture:
  - db/database.py          : MongoDB singleton + collection accessors
  - models/schemas.py       : All Pydantic request/response models
  - services/auth_service.py: JWT + bcrypt authentication helpers
  - services/ocr_service.py : EasyOCR image processing + caching
  - services/llm_service.py : Gemini LLM calls (parsing + chatbot)
  - services/insights_service.py: Adherence analytics engine
  - services/scheduler.py   : APScheduler background reminder jobs
  - routers/auth.py         : POST /auth/register, POST /auth/login
  - routers/scan.py         : POST /scan
  - routers/tracking.py     : POST /mark-done, DELETE /expired
  - routers/user.py         : GET /me, GET /user-prescriptions, GET /insights
  - routers/chat.py         : POST /chat
  - routers/doctor.py       : POST /doctor/message, GET /doctor/messages
  - routers/voice.py        : POST /voice-reminder, POST /notify

Run:
  python3 main.py
  — or —
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

import logging
import uvicorn
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Internal Modules 
from db import database
from services.scheduler import start_scheduler, stop_scheduler

# Routers 
from routers import auth, scan, tracking, user, chat, voice, doctor, voice_chat

# Logging Setup 
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-22s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("Medisync")


#  Lifespan (Startup / Shutdown) 

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager:
      Startup  → Connect to MongoDB, start background scheduler
      Shutdown → Gracefully stop scheduler
    """
    logger.info("Medisync API starting up...")

    # 1. Initialize MongoDB connection
    database.connect()

    # 2. Start background reminder scheduler (every 30 min)
    start_scheduler()

    logger.info("Medisync API is ready.")
    yield   # ← app runs here

    # Shutdown
    logger.info("Medisync API shutting down...")
    stop_scheduler()
    logger.info(" Shutdown complete.")


# FastAPI App 

app = FastAPI(
    title="Medisync API",
    description=(
        " **Medisync** — Intelligent Medication Adherence System\n\n"
        "Features: Prescription OCR, Gemini AI Parsing, JWT Auth, "
        "Dose Tracking, AI Insights, Hindi/English Chatbot, Reminder Scheduler."
    ),
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware 

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten in production to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#  Mount Routers 

app.include_router(auth.router)       # /auth/register, /auth/login
app.include_router(scan.router)       # /scan
app.include_router(tracking.router)   # /mark-done, /expired
app.include_router(user.router)       # /me, /user-prescriptions, /insights
app.include_router(chat.router)       # /chat
app.include_router(doctor.router)     # /doctor/message, /doctor/messages
app.include_router(voice.router)      # /voice-reminder, /notify
app.include_router(voice_chat.router) # /voice-chat/stream


# Health Check 

@app.get("/health-check", tags=["System"], summary="API and database health status")
def health_check():
    """
    Returns the current health status of the API and its dependencies.
    Use this to confirm the server is running and MongoDB is connected.
    """
    return {
        "status": "ok",
        "version": "2.0.0",
        "mongodb_connected": database.ping(),
        "scheduler_running": True,  # if we got here, startup succeeded
    }


@app.get("/", tags=["System"], summary="API root — welcome message")
def root():
    """Root endpoint with quick API info."""
    return {
        "message": "Welcome to Medisync API v2.0 ",
        "docs": "/docs",
        "health": "/health-check",
    }


# Entrypoint 

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info",
    )
