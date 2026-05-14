"""
services/scheduler.py — Compatibility Layer

The APScheduler background workers have been moved to `backend/workers/scheduler.py`.
This file temporarily re-exports the required functions to prevent breaking existing routers and main.py.
"""

from workers.scheduler import start_scheduler, stop_scheduler, check_and_send_reminders
