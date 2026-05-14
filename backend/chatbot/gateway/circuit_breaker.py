import time
import logging

logger = logging.getLogger("Medisync.CircuitBreaker")

class CircuitBreaker:
    """
    Soft circuit breaker for LLM providers.
    Prevents spamming a provider during an outage.
    If a provider fails 'threshold' times consecutively, it is marked 'open' (offline)
    for 'cooldown_sec' seconds.
    """
    def __init__(self, threshold: int = 3, cooldown_sec: int = 300):
        self.threshold = threshold
        self.cooldown_sec = cooldown_sec
        
        # State: { provider_name: {"failures": int, "next_retry": float} }
        self.state = {}

    def _init_provider(self, provider_name: str):
        if provider_name not in self.state:
            self.state[provider_name] = {"failures": 0, "next_retry": 0.0}

    def is_available(self, provider_name: str) -> bool:
        """Returns True if the provider is healthy or cooldown has expired."""
        self._init_provider(provider_name)
        p_state = self.state[provider_name]
        
        if p_state["failures"] >= self.threshold:
            if time.time() > p_state["next_retry"]:
                # Cooldown expired, transition to half-open (allow 1 try)
                # We don't reset failures yet; success() will reset it.
                return True
            return False
            
        return True

    def record_failure(self, provider_name: str):
        """Records a failure for the provider."""
        self._init_provider(provider_name)
        p_state = self.state[provider_name]
        
        p_state["failures"] += 1
        if p_state["failures"] >= self.threshold:
            p_state["next_retry"] = time.time() + self.cooldown_sec
            logger.warning(f"🚨 Circuit Breaker OPEN for {provider_name}. Cooldown: {self.cooldown_sec}s")

    def record_success(self, provider_name: str):
        """Resets failure count on success."""
        self._init_provider(provider_name)
        if self.state[provider_name]["failures"] > 0:
            logger.info(f"🟢 Circuit Breaker CLOSED for {provider_name}. Recovery successful.")
            self.state[provider_name]["failures"] = 0
            self.state[provider_name]["next_retry"] = 0.0

breaker = CircuitBreaker()
