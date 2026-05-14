class EscalationLevel:
    SAFE = "SAFE"                 # T-15
    DUE_SOON = "DUE_SOON"         # T-5
    CRITICAL = "CRITICAL"         # T=0
    MISSED = "MISSED"             # T+10
    ESCALATED_SOFT = "ESCALATED_SOFT"  # T+15 (Caregiver Info)
    ESCALATED_HIGH = "ESCALATED_HIGH"  # T+30 (Caregiver Action/Voice)

class EscalationStatus:
    TRIGGERED = "triggered"
    DELIVERED = "delivered"
    ACKNOWLEDGED = "acknowledged"
    FAILED = "failed"
