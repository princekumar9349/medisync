import os
from datetime import timedelta

# True if DEMO_MODE is active
DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"

def get_escalation_timings():
    """
    Returns compressed timings for Demo Mode or real timings for Production.
    Production: 15 mins, 30 mins, etc.
    Demo: 5 secs, 10 secs, 15 secs.
    """
    if DEMO_MODE:
        return {
            "reminder_delay": timedelta(seconds=5),
            "missed_delay": timedelta(seconds=10),
            "voice_call_delay": timedelta(seconds=15),
        }
    return {
        "reminder_delay": timedelta(minutes=15),
        "missed_delay": timedelta(minutes=30),
        "voice_call_delay": timedelta(minutes=60),
    }

def get_voice_confidence_threshold():
    # Lower threshold slightly in demo to ensure smoother flow, but keep strict enough
    return 0.75 if DEMO_MODE else 0.85
