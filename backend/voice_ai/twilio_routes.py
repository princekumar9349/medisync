import logging
import urllib.parse
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse
from twilio.twiml.voice_response import VoiceResponse, Gather
from pydantic import BaseModel

from voice_ai.intents.classifier import classify_intent
from voice_ai.validators.confidence import is_confident
from voice_ai.handlers.adherence_updater import process_voice_adherence
from services.voice_provider import voice_client, TwilioVoiceProvider
import os

logger = logging.getLogger("Medisync.VoiceAI.Routes")
router = APIRouter(tags=["Voice AI Webhooks"])

class InitiateCallRequest(BaseModel):
    user_id: str
    phone_number: str
    med_id: str
    medicine_name: str
    slot: str
    is_critical: bool = False

@router.post("/initiate", summary="Initiate an AI Voice Call")
async def initiate_call(payload: InitiateCallRequest, request: Request):
    """
    Triggers an outgoing call to the patient via Twilio.
    Uses the ngrok/public URL for the webhook callback.
    """
    # For Demo Mode, we support both mocked and real calls
    base_url = os.getenv("PUBLIC_API_URL", str(request.base_url).rstrip('/'))
    webhook_url = f"{base_url}/voice-ai/webhook?user_id={payload.user_id}&med_id={payload.med_id}&medicine_name={urllib.parse.quote(payload.medicine_name)}&slot={payload.slot}&is_critical={payload.is_critical}"
    
    if isinstance(voice_client, TwilioVoiceProvider):
        try:
            call = voice_client.client.calls.create(
                url=webhook_url,
                to=payload.phone_number,
                from_=voice_client.from_number,
                method="POST"
            )
            logger.info(f"AI Voice Call Initiated: {call.sid}")
            return {"status": "initiated", "call_sid": call.sid}
        except Exception as e:
            logger.error(f"Failed to initiate Twilio Call: {e}")
            raise HTTPException(status_code=500, detail="Failed to initiate voice call")
    else:
        logger.info(f"Mocking AI Voice Call to {payload.phone_number}. Webhook would be {webhook_url}")
        return {"status": "simulated", "webhook_url": webhook_url}


@router.post("/webhook", response_class=HTMLResponse)
async def voice_webhook(request: Request, user_id: str, med_id: str, medicine_name: str, slot: str, is_critical: str = "False"):
    """
    Twilio webhook hit when the call connects.
    We return TwiML to greet the user and listen for their response.
    """
    response = VoiceResponse()
    
    # We use Gather to capture speech
    gather = Gather(
        input="speech",
        action=f"/voice-ai/transcript?user_id={user_id}&med_id={med_id}&medicine_name={urllib.parse.quote(medicine_name)}&slot={slot}&is_critical={is_critical}",
        method="POST",
        language="hi-IN",
        timeout=5,
        speechTimeout="auto"
    )
    
    greeting = f"Namaste. Medisync se call hai. Kya aapne apni {medicine_name} dawa le li hai?"
    gather.say(greeting, language="hi-IN")
    
    response.append(gather)
    # If no input, say goodbye
    response.say("Humein koi aawaz nahi sunayi di. Dhanyawad.", language="hi-IN")
    
    return str(response)

@router.post("/transcript", response_class=HTMLResponse)
async def process_transcript(request: Request, user_id: str, med_id: str, medicine_name: str, slot: str, is_critical: str = "False"):
    """
    Webhook hit by Twilio with the SpeechResult.
    """
    form_data = await request.form()
    speech_result = form_data.get("SpeechResult", "")
    confidence = float(form_data.get("Confidence", "0.0"))
    
    logger.info(f"Voice Transcript received: '{speech_result}' (Confidence: {confidence})")
    
    response = VoiceResponse()
    
    if not speech_result:
        response.say("Kripya fir se batayein, hum samajh nahi paye.", language="hi-IN")
        return str(response)
        
    if not is_confident(confidence):
        logger.warning(f"Low confidence speech rejected: {confidence}")
        response.say("Aapki aawaz theek se nahi aayi, kripya fir se kahein.", language="hi-IN")
        return str(response)
        
    intent = classify_intent(speech_result)
    
    is_crit_bool = is_critical.lower() == "true"
    
    if intent == "MEDICATION_TAKEN":
        msg = process_voice_adherence(user_id, med_id, medicine_name, "taken", slot, is_crit_bool)
        response.say(msg, language="hi-IN")
    elif intent == "MEDICATION_NOT_TAKEN":
        # Maybe mark missed? We won't forcefully mark missed if they just said no, they might take it later.
        # But we could log it or just remind them.
        msg = "Kripya apni dawai samay par lijiye."
        response.say(msg, language="hi-IN")
    else:
        response.say("Hum samajh nahi paye. Kripya 'Haan' ya 'Nahi' mein jawaab dein.", language="hi-IN")
        
    return str(response)
