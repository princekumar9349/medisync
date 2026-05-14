from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field, EmailStr
from .caregiver import CallingPreferences

class OTPRequest(BaseModel):
    phone_number: str = Field(..., min_length=10, max_length=15)

class OTPVerify(BaseModel):
    phone_number: str = Field(..., min_length=10, max_length=15)
    otp_code: str = Field(..., min_length=6, max_length=6)

class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: Literal["patient", "doctor"] = "patient"
    phone: Optional[str] = Field(None, max_length=20)
    specialization: Optional[str] = Field(None, max_length=100)
    verify_phone_now: bool = False

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    reset_code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=6)

class SessionInfoResponse(BaseModel):
    user_id: str
    email: str
    role: str
    patient_id: Optional[str] = None
    phone: Optional[str] = None
    phone_verified: bool = False
    specialization: Optional[str] = None
    last_login_at: Optional[datetime] = None
    login_count: int = 0
    created_at: Optional[datetime] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class PatientLogin(BaseModel):
    patient_id: str

class UserProfile(BaseModel):
    user_id: str
    patient_id: Optional[str] = None
    name: str
    email: str
    role: str = "patient"
    age: Optional[int] = None
    gender: Optional[str] = None
    weight: Optional[float] = None
    blood_group: Optional[str] = None
    phone: Optional[str] = None
    phone_verified: bool = False
    current_streak: int = 0
    longest_streak: int = 0
    achievements: List[str] = Field(default_factory=list)
    caregiver_name: Optional[str] = None
    caregiver_phone: Optional[str] = None
    caregiver_relation: Optional[str] = None
    has_caretaker_pin: bool = False
    calling_preferences: CallingPreferences = Field(default_factory=CallingPreferences)
    created_at: datetime

class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    age: Optional[int] = None
    gender: Optional[str] = None
    weight: Optional[float] = None
    blood_group: Optional[str] = None
    caregiver_name: Optional[str] = None
    caregiver_phone: Optional[str] = None
    caregiver_relation: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    pin_version: Optional[int] = None
    session_id: Optional[str] = None
