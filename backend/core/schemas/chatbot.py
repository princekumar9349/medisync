from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field

class ChatRequest(BaseModel):
    user_data: dict = {}
    question: str = Field(..., min_length=1, max_length=1000)
    language: Literal["en", "hi"] = "en"

class ChatResponse(BaseModel):
    response: str

class VoiceReminderSchedule(BaseModel):
    user_id: str
    medicine_name: str
    scheduled_time: datetime
    phone_number: str
    language: str = "en"

class VoiceChatStartRequest(BaseModel):
    user_id: str
    language: str = "en"
    emotional_tone: str = "empathetic"

class VoiceChatResponse(BaseModel):
    session_id: str
    websocket_url: str

class SmartReportResponse(BaseModel):
    report_text: str
    critical_alerts: List[str] = []
    confidence_score: float = 0.0
    generated_at: datetime = Field(default_factory=datetime.utcnow)
