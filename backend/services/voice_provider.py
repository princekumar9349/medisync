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


# Auto-select provider based on ENV
def get_voice_provider() -> VoiceProvider:
    if os.getenv("TWILIO_ACCOUNT_SID"):
        logger.info("Using Twilio Voice Provider")
        return TwilioVoiceProvider()
    
    logger.info("Using Mock Voice Provider (Sandbox Mode)")
    return MockVoiceProvider()

voice_client = get_voice_provider()
