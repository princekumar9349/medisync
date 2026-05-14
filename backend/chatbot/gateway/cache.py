import hashlib
import re
import time
from typing import Optional, Any, Dict, Tuple

class AICache:
    """
    In-memory semantic cache for AI responses.
    Features normalized hashing to group similar queries and TTL expiration.
    """
    def __init__(self):
        # Format: { hash_key: (payload, expiry_timestamp) }
        self._store: Dict[str, Tuple[Any, float]] = {}
        self._max_size = 500

    def _normalize(self, text: str) -> str:
        """
        Aggressively normalizes text to increase cache hit rates on similar queries.
        Lowercases, strips punctuation, normalizes whitespace.
        """
        text = text.lower()
        # Remove common punctuation and special characters
        text = re.sub(r'[^\w\s]', '', text)
        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def generate_key(self, prompt: str, user_context: Optional[dict] = None) -> str:
        """Generates a stable hash key from the normalized prompt and context."""
        norm_prompt = self._normalize(prompt)
        
        # We must also include critical context in the hash, otherwise user A gets user B's answer
        # For simplicity, we stringify a subset of user_context if provided.
        ctx_str = ""
        if user_context:
            # We care about medicines and patient memory for caching uniqueness
            meds = [m.get("name") for m in user_context.get("medicines", [])]
            mem = user_context.get("patient_memory", {})
            ctx_str = str(sorted(meds)) + str(mem)
        
        final_str = f"{norm_prompt}|||{ctx_str}"
        return hashlib.md5(final_str.encode()).hexdigest()

    def get(self, key: str) -> Optional[Any]:
        if key in self._store:
            payload, expiry = self._store[key]
            if time.time() < expiry:
                return payload
            else:
                del self._store[key]
        return None

    def set(self, key: str, payload: Any, category: str = "general"):
        # Determine TTL based on category
        ttl_map = {
            "schedule": 60 * 5,       # 5 minutes (schedules change, keep short)
            "medical_info": 60 * 60,  # 1 hour (general info doesn't change fast)
            "general": 60 * 30,       # 30 mins
            "vision": 60 * 60 * 24    # 24 hours (vision scans of the exact same image hash)
        }
        ttl = ttl_map.get(category, 60 * 30)
        
        # Evict oldest if full
        if len(self._store) >= self._max_size:
            # simple eviction
            oldest_key = next(iter(self._store))
            del self._store[oldest_key]
            
        self._store[key] = (payload, time.time() + ttl)

cache = AICache()
