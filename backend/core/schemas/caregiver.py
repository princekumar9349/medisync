from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field

class CallingPreferences(BaseModel):
    enable_auto_calling: bool = False
    language: Literal["en", "hi"] = "en"
    voice_type: Literal["male", "female"] = "female"
    critical_only: bool = False
    quiet_hours_start: str = "22:00"  # HH:MM 24-hour format
    quiet_hours_end: str = "06:00"    # HH:MM 24-hour format
    caregiver_escalation: bool = True

class CallingPreferencesUpdate(BaseModel):
    enable_auto_calling: Optional[bool] = None
    language: Optional[Literal["en", "hi"]] = None
    voice_type: Optional[Literal["male", "female"]] = None
    critical_only: Optional[bool] = None
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    caregiver_escalation: Optional[bool] = None

class CaregiverUpdate(BaseModel):
    caregiver_name: str = Field(..., min_length=2, max_length=100)
    caregiver_phone: str = Field(..., min_length=10, max_length=15)
    caregiver_relation: str = Field(..., min_length=2, max_length=50)

class CaretakerLogin(BaseModel):
    patient_id: str = Field(..., min_length=4, max_length=20)
    caretaker_pin: str = Field(..., min_length=4, max_length=6, pattern=r"^\d{4,6}$")

class SetCaretakerPin(BaseModel):
    caretaker_pin: str = Field(..., min_length=4, max_length=6, pattern=r"^\d{4,6}$")
    caretaker_name: Optional[str] = Field(None, max_length=100)

class GenerateCaretakerPinRequest(BaseModel):
    caretaker_name: Optional[str] = Field(None, max_length=100)
    relationship: Optional[str] = Field(None, max_length=50)

class GeneratedPinResponse(BaseModel):
    plain_pin: str
    patient_id: str
    caretaker_name: Optional[str] = None
    relationship: Optional[str] = None
    message: str = "Store this PIN safely — it cannot be retrieved again."

class CaretakerActivityEntry(BaseModel):
    timestamp: datetime
    session_number: int = 0
    device_hint: Optional[str] = None

class CaretakerStatusResponse(BaseModel):
    has_caretaker_pin: bool = False
    access_enabled: bool = False
    caretaker_name: Optional[str] = None
    relationship: Optional[str] = None
    patient_id: Optional[str] = None
    last_login: Optional[datetime] = None
    session_count: int = 0
    session_duration_minutes: int = 60
    pin_version: int = 0

class CaretakerToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    linked_patient_id: str
    patient_name: str
    caretaker_name: Optional[str] = None
    relationship: Optional[str] = None
    expires_in: int = 3600
    session_number: int = 0

class CaretakerToggleRequest(BaseModel):
    enabled: bool
