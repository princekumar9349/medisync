from datetime import datetime
from db import database
from core.constants.escalation_levels import EscalationStatus

class EscalationHistory:
    @staticmethod
    def collection():
        # Using a new collection or dose_logs? User explicitly requested "escalation_history"
        db = database._db
        return db["escalation_history"] if db is not None else None

    @staticmethod
    def check_already_triggered(user_id: str, med_name: str, slot: str, level: str, today_start: datetime) -> bool:
        col = EscalationHistory.collection()
        if col is None:
            return False
        
        # Idempotency lock check
        exists = col.find_one({
            "user_id": user_id,
            "medicine_name": med_name,
            "note": slot,
            "severity": level,
            "triggeredAt": {"$gte": today_start}
        })
        return bool(exists)

    @staticmethod
    def log_escalation(user_id: str, med_id: str, med_name: str, slot: str, level: str, timestamp: datetime) -> str:
        col = EscalationHistory.collection()
        if col is None:
            return ""
        
        doc = {
            "user_id": user_id,
            "med_id": med_id,
            "medicine_name": med_name,
            "note": slot,
            "severity": level,
            "triggeredAt": timestamp,
            "acknowledgedAt": None,
            "deliveryStatus": EscalationStatus.TRIGGERED,
            "caregiverResponse": None
        }
        res = col.insert_one(doc)
        return str(res.inserted_id)

    @staticmethod
    def update_delivery_status(history_id: str, status: str):
        from bson import ObjectId
        col = EscalationHistory.collection()
        if col is not None and history_id:
            col.update_one({"_id": ObjectId(history_id)}, {"$set": {"deliveryStatus": status}})
