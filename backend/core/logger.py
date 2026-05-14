"""
core/logger.py — Production-hardened structured logger with JSON output + Sentry integration.

CHANGES vs v1:
  - JSON log format in production (Cloud Logging parses structured JSON natively)
  - Human-readable format in development
  - Sentry SDK initialized here (optional, non-fatal if DSN missing)
  - Async worker error capture hook
"""

import logging
import uuid
import json
from datetime import datetime
from contextvars import ContextVar
from fastapi import Request

# ─── Context Variables ────────────────────────────────────────────────────────
request_id_var: ContextVar[str] = ContextVar("request_id", default="")
patient_id_var: ContextVar[str] = ContextVar("patient_id", default="")


# ─── JSON Log Formatter (for Cloud Logging) ────────────────────────────────────
class CloudLoggingFormatter(logging.Formatter):
    """
    Formats log records as structured JSON — consumed natively by Google Cloud Logging.
    Severity maps to Cloud Logging's expected field names.
    """

    SEVERITY_MAP = {
        "DEBUG":    "DEBUG",
        "INFO":     "INFO",
        "WARNING":  "WARNING",
        "ERROR":    "ERROR",
        "CRITICAL": "CRITICAL",
    }

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp":  datetime.utcnow().isoformat() + "Z",
            "severity":   self.SEVERITY_MAP.get(record.levelname, "DEFAULT"),
            "logger":     record.name,
            "message":    record.getMessage(),
            "request_id": getattr(record, "request_id", ""),
            "patient_id": getattr(record, "patient_id", ""),
            "module":     record.module,
        }
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry, ensure_ascii=False)


# ─── Context Filter ───────────────────────────────────────────────────────────
class ContextLogFilter(logging.Filter):
    def filter(self, record):
        record.request_id = request_id_var.get()
        record.patient_id = patient_id_var.get()
        return True


# ─── Sentry Integration ───────────────────────────────────────────────────────
_sentry_initialized = False


def init_sentry(dsn: str, env: str, release: str = "medisync@3.0.0") -> bool:
    """
    Initializes Sentry SDK for crash monitoring and async worker error capture.
    Safe to call even if DSN is empty — gracefully skips.
    Returns True if Sentry was successfully initialized.
    """
    global _sentry_initialized
    if not dsn or _sentry_initialized:
        return _sentry_initialized

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration

        sentry_logging = LoggingIntegration(
            level=logging.WARNING,     # Capture WARNING and above as breadcrumbs
            event_level=logging.ERROR  # Send ERROR and above as Sentry events
        )

        sentry_sdk.init(
            dsn=dsn,
            environment=env,
            release=release,
            integrations=[
                FastApiIntegration(),
                StarletteIntegration(),
                sentry_logging,
            ],
            traces_sample_rate=0.1,    # 10% performance tracing — adjust as needed
            profiles_sample_rate=0.05, # 5% profiling
            send_default_pii=False,    # HIPAA: never send PII
        )
        _sentry_initialized = True
        logging.getLogger("Medisync").info("✅ Sentry initialized for crash monitoring.")
        return True
    except ImportError:
        logging.getLogger("Medisync").warning(
            "sentry-sdk not installed — Sentry monitoring disabled. "
            "Add 'sentry-sdk[fastapi]' to requirements.txt."
        )
        return False
    except Exception as e:
        logging.getLogger("Medisync").warning(f"Sentry init failed (non-fatal): {e}")
        return False


def capture_worker_exception(error: Exception, context: dict | None = None) -> None:
    """
    Capture an exception from an async worker (APScheduler, event bus handler).
    Safe to call when Sentry is not initialized.
    """
    if not _sentry_initialized:
        return
    try:
        import sentry_sdk
        with sentry_sdk.push_scope() as scope:
            if context:
                for k, v in context.items():
                    scope.set_extra(k, v)
            scope.set_tag("source", "worker")
            sentry_sdk.capture_exception(error)
    except Exception:
        pass  # Never let Sentry crash the worker


# ─── Logger Setup ─────────────────────────────────────────────────────────────
def setup_logger(is_production: bool = False) -> logging.Logger:
    """
    Initializes the root Medisync logger.
    - Production: JSON output → Cloud Logging
    - Development: human-readable format
    """
    logger = logging.getLogger("Medisync")
    logger.setLevel(logging.INFO)

    if logger.handlers:
        return logger  # Already configured

    handler = logging.StreamHandler()
    handler.addFilter(ContextLogFilter())

    if is_production:
        handler.setFormatter(CloudLoggingFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s | %(request_id)-8s | %(name)-24s | %(levelname)-8s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ))

    logger.addHandler(handler)
    return logger


async def logging_middleware(request: Request, call_next):
    """Generates a request_id and injects it into ContextVars for the request lifetime."""
    req_id = str(uuid.uuid4())[:8]
    token1 = request_id_var.set(req_id)
    token2 = patient_id_var.set("")
    try:
        response = await call_next(request)
        return response
    finally:
        request_id_var.reset(token1)
        patient_id_var.reset(token2)


def get_logger(module_name: str) -> logging.Logger:
    logger = logging.getLogger(f"Medisync.{module_name}")
    logger.addFilter(ContextLogFilter())
    return logger
