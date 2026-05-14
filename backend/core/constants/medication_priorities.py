class MedicationPriority:
    NORMAL = "normal"             # Standard timeline (T+15 soft, T+30 high)
    CRITICAL = "critical"         # Fast timeline (bypasses soft, goes straight to high)
    SUPPLEMENT = "supplement"     # Very slow timeline (no caregiver escalation)
