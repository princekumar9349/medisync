"""
services/emergency.py
Handles Caregiver alerts and Emergency SOS functionality.
Currently mocks Twilio SMS but preserves production-ready abstraction.
"""
import logging

logger = logging.getLogger(__name__)

class EmergencyService:
    def __init__(self):
        # Scaffold Twilio config here for future integration
        # self.twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        pass

    async def send_caregiver_alert(self, caregiver_phone: str, caregiver_name: str, patient_name: str, message: str) -> bool:
        """
        Send an SMS/WhatsApp alert to a caregiver.
        Currently mocked for local development.
        """
        if not caregiver_phone:
            logger.warning(f"No caregiver phone provided for patient {patient_name}. Cannot send alert.")
            return False
            
        alert_body = f"[MEDISYNC URGENT] Hello {caregiver_name}, this is an alert regarding {patient_name}: {message}"
        
        # MOCK TWILIO SMS SEND
        logger.info(f"--- MOCK TWILIO SMS ---")
        logger.info(f"To: {caregiver_phone}")
        logger.info(f"Body: {alert_body}")
        logger.info(f"-----------------------")
        
        # return bool(self.twilio_client.messages.create(body=alert_body, from_=TWILIO_NUMBER, to=caregiver_phone))
        return True

    async def trigger_emergency_sos(self, patient_profile: dict, location_url: str = None) -> bool:
        """
        Triggered when a user hits the Emergency SOS button.
        """
        caregiver_phone = patient_profile.get("caregiver_phone")
        caregiver_name = patient_profile.get("caregiver_name", "Caregiver")
        patient_name = patient_profile.get("name", "User")
        
        message = f"{patient_name} has triggered an Emergency SOS from the MediSync app."
        if location_url:
            message += f" Location: {location_url}"
            
        return await self.send_caregiver_alert(caregiver_phone, caregiver_name, patient_name, message)

emergency_service = EmergencyService()
