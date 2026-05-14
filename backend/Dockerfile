# ─────────────────────────────────────────────────────────────────────────────
# Medisync Backend — Production Dockerfile
# Multi-stage build: deps layer + app layer for lean final image
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Dependency builder ────────────────────────────────────────────────
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /build

# Install build tools only in the builder stage
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for Docker layer caching
COPY requirements.txt .

# Install all Python deps into /build/wheels (no cache = smaller image)
RUN pip install --upgrade pip && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: OCR dependencies (heavy — isolated) ──────────────────────────────
FROM python:3.11-slim AS ocr-builder

WORKDIR /ocr

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --prefix=/ocr-install \
    paddlepaddle \
    paddleocr \
    opencv-python-headless


# ── Stage 3: Production runtime ────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8080
# Prevents Python from buffering stdout (important for Cloud Logging)
ENV PYTHONFAULTHANDLER=1

# Runtime system libs (lean — no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed packages from builder stages
COPY --from=builder    /install /usr/local
COPY --from=ocr-builder /ocr-install /usr/local

# ── Security: non-root user ────────────────────────────────────────────────────
# Running as root in production containers is a security risk.
RUN groupadd --gid 1001 medisync && \
    useradd --uid 1001 --gid medisync --shell /bin/bash --create-home medisync

# Copy application source
COPY --chown=medisync:medisync . /app/

# Remove dev-only files from the image
RUN rm -f /app/.env /app/env.yaml /app/.env.* && \
    find /app -name "*.pyc" -delete && \
    find /app -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

USER medisync

# ── Healthcheck (Cloud Run also uses /health endpoint) ────────────────────────
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

EXPOSE ${PORT}

# ── Production startup ─────────────────────────────────────────────────────────
# - 2 workers: Cloud Run single-instance has 1 vCPU — 2 workers = optimal
# - --timeout 120: gives slow OCR/AI requests enough time
# - --graceful-timeout 30: allows in-flight requests to complete on shutdown
# - --preload: loads app once before forking (faster first response)
CMD ["sh", "-c", \
  "uvicorn main:app \
    --host 0.0.0.0 \
    --port ${PORT} \
    --workers 2 \
    --timeout-keep-alive 30 \
    --log-level warning \
    --no-access-log"]
