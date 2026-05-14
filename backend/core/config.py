"""
core/config.py — Production-hardened settings with startup validation.

CHANGES vs v1:
  - SENTRY_DSN, FCM credentials, CORS_ORIGINS added
  - validate_production_env() raises at startup if critical vars are missing
  - Safe JWT_SECRET (no hardcoded fallback in production)
  - SCHEDULER_ENABLED flag for Cloud Run horizontal scaling safety
"""

import os
import sys
import logging
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("Medisync.Config")


class AppSettings(BaseModel):
    # ── Environment ───────────────────────────────────────────────────────────
    ENV: str = os.getenv("ENV", "development")

    # ── Server ────────────────────────────────────────────────────────────────
    PORT: int = int(os.getenv("PORT", 8000))

    # ── MongoDB ───────────────────────────────────────────────────────────────
    MONGO_URI: str = os.getenv("MONGO_URI", "")
    MONGO_DB_NAME: str = os.getenv("MONGO_DB_NAME", "medisync_db")

    # ── LLMs ──────────────────────────────────────────────────────────────────
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")

    # ── Auth ──────────────────────────────────────────────────────────────────
    # No default in production — will be caught by validate_production_env()
    JWT_SECRET: str = os.getenv("JWT_SECRET_KEY", os.getenv("JWT_SECRET", ""))
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))

    # ── Observability ─────────────────────────────────────────────────────────
    SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Comma-separated list of allowed origins. "*" only safe for development.
    CORS_ORIGINS: str = os.getenv(
        "CORS_ORIGINS",
        "https://app.medisync.com,https://staging.medisync.com,http://localhost:3000,http://localhost:8081,exp://127.0.0.1:19000"
    )

    # ── Scheduler Safety (Cloud Run horizontal scaling) ───────────────────────
    # Set to "false" on API replicas — only the dedicated worker container runs scheduler.
    # In single-container mode (current), keep "true".
    SCHEDULER_ENABLED: bool = os.getenv("SCHEDULER_ENABLED", "true").lower() == "true"

    # ── Firebase ──────────────────────────────────────────────────────────────
    FIREBASE_CREDENTIALS: str = os.getenv("FIREBASE_CREDENTIALS", "firebase/serviceAccountKey.json")

    # ── OTP / Messaging ───────────────────────────────────────────────────────
    MOCK_OTP_ENABLED: bool = os.getenv("MOCK_OTP_ENABLED", "true").lower() == "true"

    @property
    def is_production(self) -> bool:
        return self.ENV.lower() == "production"

    @property
    def is_staging(self) -> bool:
        return self.ENV.lower() == "staging"

    @property
    def cors_origins_list(self) -> list[str]:
        """Returns CORS_ORIGINS as a parsed list."""
        if self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = AppSettings()


# ── Critical Startup Validation ───────────────────────────────────────────────

# These vars MUST be present at startup in production/staging.
# Application will crash-fast rather than silently degrade.
_REQUIRED_IN_PROD = {
    "MONGO_URI":       settings.MONGO_URI,
    "JWT_SECRET_KEY":  settings.JWT_SECRET,
    "GEMINI_API_KEY":  settings.GEMINI_API_KEY,
    "GROQ_API_KEY":    settings.GROQ_API_KEY,
}

# These are strongly recommended in production but won't crash the server
_RECOMMENDED_IN_PROD = {
    "SENTRY_DSN":      settings.SENTRY_DSN,
    "FIREBASE_CREDENTIALS": settings.FIREBASE_CREDENTIALS,
}


def validate_production_env() -> None:
    """
    Validates required environment variables at startup.
    Fails fast in production/staging if critical vars are missing.
    Logs warnings for recommended-but-optional vars.
    """
    env = settings.ENV.lower()
    is_strict = env in ("production", "staging")

    missing_critical = [k for k, v in _REQUIRED_IN_PROD.items() if not v]
    missing_recommended = [k for k, v in _RECOMMENDED_IN_PROD.items() if not v]

    if missing_critical:
        if is_strict:
            msg = (
                f"FATAL: Missing required environment variables for {env}: "
                f"{', '.join(missing_critical)}. "
                "Refusing to start — configure secrets before deployment."
            )
            logger.critical(msg)
            sys.exit(1)
        else:
            logger.warning(
                f"[DEV MODE] Missing env vars (acceptable in dev): {', '.join(missing_critical)}"
            )

    if missing_recommended:
        logger.warning(
            f"Recommended env vars not set (degraded mode): {', '.join(missing_recommended)}"
        )

    # Warn if JWT_SECRET looks like a default/weak value
    weak_jwt_patterns = ["secret", "change", "super", "test", "default", "example"]
    if settings.JWT_SECRET and any(p in settings.JWT_SECRET.lower() for p in weak_jwt_patterns):
        if is_strict:
            logger.critical("FATAL: JWT_SECRET_KEY appears to be a default/weak value. Set a strong secret.")
            sys.exit(1)
        else:
            logger.warning("JWT_SECRET_KEY looks weak — replace before production deployment.")

    # Warn/crash about CORS wildcard in production
    if is_strict and settings.CORS_ORIGINS.strip() == "*":
        logger.critical("FATAL: CORS_ORIGINS cannot be '*' in production/staging. Set explicit domains.")
        sys.exit(1)

    logger.info(
        f"✅ Config validated | ENV={env} | "
        f"Scheduler={'enabled' if settings.SCHEDULER_ENABLED else 'disabled'} | "
        f"Sentry={'configured' if settings.SENTRY_DSN else 'not configured'}"
    )
