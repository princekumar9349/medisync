"""
services/voice_provider.py — Abstract voice provider for automated calls/SMS.
Supports swapping between Twilio, Exotel, and a Mock provider for sandbox testing.
"""
import logging
import os
from typing import Optional

logger = logging.getLogger("Medisync.VoiceProvider")

class VoiceProvider:
    def send_call(self, to_number: str, message: str) -> bool:
        raise NotImplementedError

    def send_sms(self, to_number: str, message: str) -> bool:
        raise NotImplementedError


class MockVoiceProvider(VoiceProvider):
    """Sandbox provider for testing without credentials."""
    def send_call(self, to_number: str, message: str) -> bool:
        logger.info(f"📞 [MOCK CALL] Ringing {to_number}...")
        logger.info(f"🔊 [MOCK TTS] Saying: '{message}'")
        return True

    def send_sms(self, to_number: str, message: str) -> bool:
        logger.info(f"💬 [MOCK SMS] To {to_number}: '{message}'")
        return True


class TwilioVoiceProvider(VoiceProvider):
    """Production provider using Twilio API."""
    def __init__(self):
        self.sid = os.getenv("TWILIO_ACCOUNT_SID")
        self.auth = os.getenv("TWILIO_AUTH_TOKEN")
        self.from_number = os.getenv("TWILIO_PHONE_NUMBER")
        
        if self.sid and self.auth:
            from twilio.rest import Client
            self.client = Client(self.sid, self.auth)
        else:
            self.client = None

    def send_call(self, to_number: str, message: str) -> bool:
        if not self.client:
            logger.error("Twilio credentials missing. Call failed.")
            return False
            
        try:
            # Using TwiML to say the message
            twiml = f"<Response><Say>{message}</Say></Response>"
            call = self.client.calls.create(
                twiml=twiml,
                to=to_number,
                from_=self.from_number
            )
            logger.info(f"📞 Twilio Call initiated: {call.sid}")
            return True
        except Exception as e:
            logger.error(f"Twilio Call Error: {e}")
            return False

    def send_sms(self, to_number: str, message: str) -> bool:
        if not self.client:
            logger.error("Twilio credentials missing. SMS failed.")
            return False
            
        try:
            msg = self.client.messages.create(
                body=message,
                to=to_number,
                from_=self.from_number
            )
            logger.info(f"💬 Twilio SMS sent: {msg.sid}")
            return True
        except Exception as e:
            logger.error(f"Twilio SMS Error: {e}")
            return False


class ExotelVoiceProvider(VoiceProvider):
    """Production provider using Exotel API (India)."""
    def __init__(self):
        self.api_key = os.getenv("EXOTEL_API_KEY")
        self.api_token = os.getenv("EXOTEL_API_TOKEN")
        self.subdomain = os.getenv("EXOTEL_SUBDOMAIN", "api.exotel.com")
        self.sid = os.getenv("EXOTEL_SID")
        self.caller_id = os.getenv("EXOTEL_CALLER_ID")
        self.app_id = os.getenv("EXOTEL_APP_ID")

    def send_call(self, to_number: str, message: str) -> bool:
        """
        Triggers an Exotel Call linking to the predefined App Flow.
        Currently uses the static Greeting app flow for testing.
        """
        if not self.api_key or not self.sid or not self.app_id:
            logger.error("Exotel credentials (SID, API Key, APP_ID) missing.")
            return False
            
        import requests
        
        url = f"https://{self.api_key}:{self.api_token}@{self.subdomain}/v1/Accounts/{self.sid}/Calls/connect.json"
        
        # In Exotel, to trigger an app flow:
        # 'From' is the user to call.
        # 'Url' is the webhook or internal app url.
        app_url = f"http://my.exotel.com/{self.sid}/exoml/start_voice/{self.app_id}"
        
        data = {
            "From": to_number,
            "CallerId": self.caller_id,
            "Url": app_url
        }
        
        try:
            response = requests.post(url, data=data)
            if response.status_code in [200, 201]:
                logger.info(f"📞 Exotel Call initiated to {to_number}")
                return True
            else:
                logger.error(f"Exotel Call Error: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Exotel API Exception: {e}")
            return False

    def send_sms(self, to_number: str, message: str) -> bool:
        if not self.api_key or not self.sid:
            logger.error("Exotel credentials missing.")
            return False
            
        import requests
        
        url = f"https://{self.api_key}:{self.api_token}@{self.subdomain}/v1/Accounts/{self.sid}/Sms/send.json"
        
        data = {
            "From": self.caller_id,
            "To": to_number,
            "Body": message
        }
        
        try:
            response = requests.post(url, data=data)
            if response.status_code in [200, 201]:
                logger.info(f"💬 Exotel SMS sent to {to_number}")
                return True
            else:
                logger.error(f"Exotel SMS Error: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Exotel SMS Exception: {e}")
            return False


# Auto-select provider based on ENV
def get_voice_provider() -> VoiceProvider:
    if os.getenv("TWILIO_ACCOUNT_SID"):
        logger.info("Using Twilio Voice Provider")
        return TwilioVoiceProvider()
    
    logger.info("Using Mock Voice Provider (Sandbox Mode)")
    return MockVoiceProvider()

voice_client = get_voice_provider()
