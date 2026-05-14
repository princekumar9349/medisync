from enum import Enum

class DomainEvent(str, Enum):
    # Adherence Events
    DOSE_TAKEN = "adherence.dose_taken"
    DOSE_MISSED = "adherence.dose_missed"
    DOSE_SKIPPED = "adherence.dose_skipped"
    
    # Caregiver Events
    CAREGIVER_ALERTED = "caregiver.alerted"
    ESCALATION_TRIGGERED = "escalation.triggered"
    
    # User / Auth Events
    USER_REGISTERED = "user.registered"
    CARETKER_PIN_GENERATED = "caretaker.pin_generated"
    
    # Chatbot / Voice Events
    CHATBOT_MESSAGE_RECEIVED = "chatbot.message_received"
    VOICE_REMINDER_SENT = "voice.reminder_sent"
    
    # IoT Events (Future)
    IOT_DEVICE_CONNECTED = "iot.device_connected"
    IOT_DISPENSER_OPENED = "iot.dispenser_opened"
    
    # Notification Events (Analytics)
    NOTIFICATION_SENT = "notification.sent"
    NOTIFICATION_TAPPED = "notification.tapped"

    # AI / Gateway Events (Analytics)
    AI_RESPONSE_GENERATED = "ai.response_generated"

    # Sync Events (Analytics)
    SYNC_FAILED = "sync.failed"

    # System Events
    SYNC_RECONCILIATION_COMPLETED = "sync.reconciliation_completed"
