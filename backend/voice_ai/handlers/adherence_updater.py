import logging
from datetime import datetime, timezone
from db import database
from backend.api.tracking import _get_today_log, _compute_dose_state

logger = logging.getLogger("Medisync.VoiceAI.Adherence")

def process_voice_adherence(user_id: str, med_id: str, medicine_name: str, status: str, slot_key: str, is_critical: bool = False) -> str:
    """
    Processes a voice adherence update.
    Returns the appropriate TwiML response message.
    """
    dose_logs_col = database.get_dose_logs()
    if dose_logs_col is None:
        logger.error("Database unavailable for voice adherence.")
        return "Internal server error. Please try again later."
        
    # Check for duplicate
    existing = _get_today_log(dose_logs_col, user_id, med_id, slot_key)
    if existing and existing["status"] in ("taken", "skipped"):
        logger.info(f"Duplicate adherence prevented via Voice AI for {user_id}, med {med_id}")
        return "Aapne ye medicine already mark kar di hai. Dhanyawad!"
        
    if status == "taken":
        # Check if window is valid
        state = _compute_dose_state(slot_key, None)
        if not state["can_take"]:
            return f"The window for your {slot_key} dose has expired. Cannot mark as taken."
            
    # Calculate delay
    delay_minutes = 0
    # Simplification: we don't calculate exact delay here, but we can if we import SLOT_WINDOWS
    # For now, just set 0
    
    log_doc = {
        "user_id":       user_id,
        "med_id":        med_id,
        "medicine_name": medicine_name,
        "status":        status,
        "slot":          slot_key or "unknown",
        "timestamp":     datetime.utcnow(),
        "delay_minutes": delay_minutes,
        "is_critical":   is_critical,
        "note":          "Marked via AI Voice Confirmation Call",
        "source":        "voice_ai",
    }
    
    try:
        dose_logs_col.insert_one(log_doc)
        logger.info(f"✅ Voice Dose: {med_id} -> {status} for {user_id[:8]}")
        
        # Invalidate analytics snapshot
        try:
            from backend.analytics.snapshots.manager import invalidate_user_snapshot
            invalidate_user_snapshot(user_id, reason="voice_dose_logged")
        except Exception:
            pass
            
        if status == "taken":
            return "Shukriya. Aapka dose mark kar diya gaya hai. Apna khayal rakhiye."
        else:
            return "Theek hai. Kripya apni dawai samay par lijiye. Apna khayal rakhiye."
    except Exception as e:
        logger.error(f"Voice adherence log save failed: {e}")
        return "Sorry, there was an error processing your response."
