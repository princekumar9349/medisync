from adherence.state_machine import SLOT_WINDOWS

def resolve_target_slots(med: dict) -> list:
    """
    Extract expected slots from a medicine dictionary.
    Handles legacy formats like `{"morning": True}` and new formats like `{"schedule": ["morning"]}`.
    """
    s = med.get("schedule", [])
    slots = [x for x in s if x in SLOT_WINDOWS]
    if not slots:
        if med.get("morning"):   slots.append("morning")
        if med.get("afternoon"): slots.append("afternoon")
        if med.get("night"):     slots.append("night")
    return slots or ["morning"]

def get_current_or_next_slot(slots: list) -> str:
    """
    Given a list of slots, returns the first one. 
    (Can be extended to return the slot most appropriate for the current IST time).
    """
    if not slots:
        return "morning"
    return slots[0]
