import os
import time
from typing import Dict, Tuple, Optional
from fastapi import Request, HTTPException, status
from collections import defaultdict
import logging
from core.logger import get_logger

logger = get_logger("Medisync.RateLimit")

class RateLimitBackend:
    def is_rate_limited(self, key: str, max_requests: int, window_seconds: int) -> Tuple[bool, int]:
        """Returns (is_limited, retry_after_seconds)"""
        raise NotImplementedError

class MemoryBackend(RateLimitBackend):
    def __init__(self):
        # Format: {key: (request_count, window_start_time)}
        self._store: Dict[str, Tuple[int, float]] = {}

    def is_rate_limited(self, key: str, max_requests: int, window_seconds: int) -> Tuple[bool, int]:
        now = time.time()
        
        # Cleanup old entries occasionally (could be optimized)
        if len(self._store) > 10000:
            self._store = {k: v for k, v in self._store.items() if now - v[1] < window_seconds}

        record = self._store.get(key)
        
        if record is None or (now - record[1]) >= window_seconds:
            # New window
            self._store[key] = (1, now)
            return False, 0
            
        count, start_time = record
        
        if count >= max_requests:
            retry_after = int(window_seconds - (now - start_time))
            return True, max(1, retry_after)
            
        # Increment count
        self._store[key] = (count + 1, start_time)
        return False, 0

class RedisBackend(RateLimitBackend):
    def __init__(self, redis_client):
        self.redis = redis_client

    def is_rate_limited(self, key: str, max_requests: int, window_seconds: int) -> Tuple[bool, int]:
        if not self.redis:
            return False, 0
            
        try:
            # Simple atomic increment with TTL
            # Not a perfect sliding window, but good enough for abuse prevention
            pipe = self.redis.pipeline()
            pipe.incr(key)
            pipe.ttl(key)
            results = pipe.execute()
            
            count = results[0]
            ttl = results[1]
            
            if count == 1 or ttl < 0:
                self.redis.expire(key, window_seconds)
                
            if count > max_requests:
                return True, max(1, ttl if ttl > 0 else window_seconds)
                
            return False, 0
        except Exception as e:
            logger.error(f"Redis rate limiting failed, allowing request: {e}")
            return False, 0

# ─── Initialization ─────────────────────────────────────────────────────────

REDIS_URI = os.getenv("REDIS_URI")

if REDIS_URI:
    try:
        import redis
        client = redis.from_url(REDIS_URI, decode_responses=True)
        backend = RedisBackend(client)
        logger.info("Using Redis rate limit backend.")
    except Exception as e:
        logger.warning(f"Failed to connect to Redis for rate limiting: {e}. Falling back to MemoryBackend.")
        backend = MemoryBackend()
else:
    logger.info("No REDIS_URI found. Using Memory rate limit backend.")
    backend = MemoryBackend()

# ─── FastAPI Dependency ───────────────────────────────────────────────────────

class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int, prefix: str = "ratelimit"):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.prefix = prefix

    async def __call__(self, request: Request):
        # Extract IP and User ID if available
        forwarded_for = request.headers.get("x-forwarded-for")
        ip = forwarded_for.split(",")[0].strip() if forwarded_for else request.client.host if request.client else "unknown"
        
        # Try to get user from auth context, otherwise use IP
        user_id = getattr(request.state, "user_id", None)
        
        identifier = user_id if user_id else f"ip:{ip}"
        key = f"{self.prefix}:{identifier}"
        
        is_limited, retry_after = backend.is_rate_limited(key, self.max_requests, self.window_seconds)
        
        if is_limited:
            logger.warning(f"Rate limit exceeded for {key}. Retry in {retry_after}s.")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many requests. Please try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)}
            )
