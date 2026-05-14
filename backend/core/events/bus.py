import asyncio
import logging
from typing import Callable, Dict, List, Any
from .types import DomainEvent

# In a full structured logging setup, this will use the injected request_id
logger = logging.getLogger("Medisync.EventBus")

class EventBus:
    """
    Lightweight, non-blocking in-memory Pub/Sub event bus.
    Ensures publishers are never blocked by subscribers.
    Isolates subscriber failures and implements timeout protection.
    """
    def __init__(self):
        self._subscribers: Dict[DomainEvent, List[Callable]] = {}

    def subscribe(self, event_type: DomainEvent, handler: Callable):
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []
        self._subscribers[event_type].append(handler)
        logger.info(f"Subscribed {handler.__name__} to {event_type.value}")

    async def publish(self, event_type: DomainEvent, payload: Any):
        """
        Non-blocking publish. Dispatches event handling to asyncio background tasks.
        """
        handlers = self._subscribers.get(event_type, [])
        if not handlers:
            logger.debug(f"Event {event_type.value} published, but no subscribers found.")
            return

        logger.info(f"Publishing event {event_type.value} to {len(handlers)} subscribers.")
        
        # Dispatch each handler in the background to prevent blocking the publisher
        for handler in handlers:
            asyncio.create_task(self._safe_execute(event_type, handler, payload))

    async def _safe_execute(self, event_type: DomainEvent, handler: Callable, payload: Any):
        """
        Executes a subscriber with exception isolation and timeout protection.
        """
        try:
            # 30-second timeout protection per subscriber
            await asyncio.wait_for(handler(payload), timeout=30.0)
            logger.debug(f"Successfully processed {event_type.value} via {handler.__name__}")
        except asyncio.TimeoutError:
            logger.error(f"Timeout processing {event_type.value} via {handler.__name__}")
            self._dead_letter(event_type, payload, "Timeout")
        except Exception as e:
            logger.exception(f"Subscriber {handler.__name__} crashed on {event_type.value}: {e}")
            self._dead_letter(event_type, payload, str(e))

    def _dead_letter(self, event_type: DomainEvent, payload: Any, reason: str):
        """
        Fallback logging for failed events to prevent data loss.
        Future: Write to a MongoDB dead-letter collection.
        """
        logger.error(f"[DEAD-LETTER] Event: {event_type.value} | Reason: {reason} | Payload: {payload}")

# Global singleton event bus
bus = EventBus()
