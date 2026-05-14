import time
import logging
import asyncio
from typing import Any, Optional

from .cache import cache
from .circuit_breaker import breaker
from ..providers.llm_client import call_gemini, call_groq, call_gemini_vision
from ..providers.local_fallback import get_fallback_response

logger = logging.getLogger("Medisync.AIGateway")

class AIGateway:
    """
    Central AI Ingestion Gateway.
    Responsible for:
      - Cache resolution
      - Soft circuit-breaking & Throttling
      - Multi-provider failover (Gemini -> Groq -> Local Fallback)
      - Graceful degradation
      - Observability tracking
    """
    
    @staticmethod
    def _get_category(prompt: str) -> str:
        """Simple heuristic to categorize requests for Cache TTL and Metrics."""
        prompt_lower = prompt.lower()
        if "schedule" in prompt_lower or "1-0-1" in prompt_lower:
            return "schedule"
        elif "ocr" in prompt_lower or "scan" in prompt_lower:
            return "vision"
        elif "adherence analytics" in prompt_lower:
            return "analytics"
        return "general"

    @classmethod
    def generate(
        cls,
        system_prompt: str,
        user_text: str,
        user_context: Optional[dict] = None,
        temperature: float = 0.3,
        expect_json: bool = False,
        is_vision: bool = False,
        image_bytes: Optional[bytes] = None,
        mime_type: str = "image/jpeg"
    ) -> Any:
        
        start_time = time.time()
        category = cls._get_category(system_prompt + user_text)
        
        # ─── 1. Cache Check ───────────────────────────────────────────────────
        if is_vision and image_bytes:
            # Special case for Vision caching (hash the image bytes)
            import hashlib
            cache_k = "vision_" + hashlib.md5(image_bytes).hexdigest()
        else:
            cache_k = cache.generate_key(system_prompt + user_text, user_context)
            
        cached_res = cache.get(cache_k)
        if cached_res is not None:
            cls._log_metrics("CACHE", True, False, start_time, category)
            return cached_res

        # ─── 2. Primary Provider (Gemini) ─────────────────────────────────────
        if breaker.is_available("gemini"):
            try:
                if is_vision and image_bytes:
                    res = call_gemini_vision(system_prompt, image_bytes, mime_type)
                else:
                    res = call_gemini(system_prompt, user_text, temperature=temperature, expect_json=expect_json)
                
                if res:
                    breaker.record_success("gemini")
                    cache.set(cache_k, res, category)
                    cls._log_metrics("GEMINI", False, False, start_time, category)
                    return res
                else:
                    # Empty response means provider failed internally (e.g. 500)
                    breaker.record_failure("gemini")
            except Exception as e:
                logger.warning(f"Gateway: Gemini failed with exception: {e}")
                breaker.record_failure("gemini")
        
        # ─── 3. Fallback Provider (Groq) ──────────────────────────────────────
        # Vision requests cannot fallback to Groq text model (we need a multimodal fallback for that).
        if not is_vision and breaker.is_available("groq"):
            try:
                res = call_groq(system_prompt, user_text, temperature=temperature, expect_json=expect_json)
                if res:
                    breaker.record_success("groq")
                    cache.set(cache_k, res, category)
                    cls._log_metrics("GROQ", False, True, start_time, category)
                    return res
                else:
                    breaker.record_failure("groq")
            except Exception as e:
                logger.warning(f"Gateway: Groq failed with exception: {e}")
                breaker.record_failure("groq")

        # ─── 4. Emergency Local Templates (Offline/Degraded Mode) ─────────────
        logger.error("Gateway: ALL LLM PROVIDERS FAILED. Routing to Local Fallback Mode.")
        res = get_fallback_response(user_text, expect_json=expect_json, json_schema_hint=system_prompt)
        cls._log_metrics("LOCAL_FALLBACK", False, True, start_time, category)
        return res

    @staticmethod
    def _log_metrics(provider: str, cache_hit: bool, fallback_used: bool, start_time: float, category: str):
        """Structured observability for AI requests — logs + fires analytics event."""
        latency_ms = int((time.time() - start_time) * 1000)
        degraded = provider == "LOCAL_FALLBACK"

        logger.info(
            f"AI_METRICS | Provider: {provider} | CacheHit: {cache_hit} | "
            f"Fallback: {fallback_used} | Latency: {latency_ms}ms | Category: {category}"
        )

        # Emit analytics event (non-blocking fire-and-forget)
        try:
            from core.events.bus import bus
            from core.events.types import DomainEvent
            payload = {
                "provider":      provider,
                "category":      category,
                "cache_hit":     cache_hit,
                "fallback_used": fallback_used,
                "latency_ms":    latency_ms,
                "degraded_mode": degraded,
            }
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(bus.publish(DomainEvent.AI_RESPONSE_GENERATED, payload))
        except Exception:
            pass  # Never let observability code crash the gateway

