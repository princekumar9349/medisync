from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field

class EmergencyCreate(BaseModel):
    note: Optional[str] = Field(None, max_length=500)
    location: Optional[str] = None

class EmergencyOut(BaseModel):
    emergency_id: str
    user_id: str
    status: Literal["pending", "accepted", "resolved", "cancelled"] = "pending"
    note: Optional[str] = None
    location: Optional[str] = None
    responder_id: Optional[str] = None
    responder_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    retry_count: int = 0

class EmergencyStatusResponse(BaseModel):
    has_active: bool = False
    emergency: Optional[EmergencyOut] = None

class EmergencyResolvePayload(BaseModel):
    emergency_id: str
    note: Optional[str] = None
