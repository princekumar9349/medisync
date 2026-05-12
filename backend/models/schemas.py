"""
models/schemas.py — Centralized Pydantic models for Medisync.

All request/response schemas live here to avoid circular imports
and keep the API contract in one place.
"""

from datetime import datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, EmailStr


# ─── Calling & Caregiver Preferences ──────────────────────────────────────────

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


# ─── Auth & OTP ───────────────────────────────────────────────────────────────

class OTPRequest(BaseModel):
    phone_number: str = Field(..., min_length=10, max_length=15)

class OTPVerify(BaseModel):
    phone_number: str = Field(..., min_length=10, max_length=15)
    otp_code: str = Field(..., min_length=6, max_length=6)


# ─── Auth ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    """Registration payload."""
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: Literal["patient", "doctor"] = "patient"
    # Optional fields — never block registration if missing
    phone: Optional[str] = Field(None, max_length=20)
    specialization: Optional[str] = Field(None, max_length=100)   # doctor only
    verify_phone_now: bool = False   # opt-in OTP during registration


class ForgotPasswordRequest(BaseModel):
    """Payload for POST /auth/forgot-password."""
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Payload for POST /auth/reset-password."""
    email: EmailStr
    reset_code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=6)


class SessionInfoResponse(BaseModel):
    """Basic session/device info returned by GET /auth/me/session."""
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
    """Login payload (Doctor / Admin)."""
    email: EmailStr
    password: str


class PatientLogin(BaseModel):
    """Simplified login for Patients (ID only)."""
    patient_id: str


class CaretakerLogin(BaseModel):
    """Caretaker login: patient_id + hashed PIN."""
    patient_id: str = Field(..., min_length=4, max_length=20)
    caretaker_pin: str = Field(..., min_length=4, max_length=6, pattern=r"^\d{4,6}$")


class SetCaretakerPin(BaseModel):
    """Patient sets/updates their caretaker access PIN."""
    caretaker_pin: str = Field(..., min_length=4, max_length=6, pattern=r"^\d{4,6}$")
    caretaker_name: Optional[str] = Field(None, max_length=100)


# ─── Caretaker Management Schemas ─────────────────────────────────────────────

CARETAKER_RELATIONSHIPS = [
    "Father", "Mother", "Son", "Daughter",
    "Sibling", "Spouse", "Nurse", "Relative", "Other"
]

class GenerateCaretakerPinRequest(BaseModel):
    """Patient requests auto-generation of a new caretaker PIN."""
    caretaker_name: Optional[str] = Field(None, max_length=100)
    relationship: Optional[str] = Field(None, max_length=50)


class GeneratedPinResponse(BaseModel):
    """Response after generating a caretaker PIN — plain PIN shown ONCE."""
    plain_pin: str          # shown to patient once, never stored
    patient_id: str
    caretaker_name: Optional[str] = None
    relationship: Optional[str] = None
    message: str = "Store this PIN safely — it cannot be retrieved again."


class CaretakerActivityEntry(BaseModel):
    """A single caretaker login/activity record."""
    timestamp: datetime
    session_number: int = 0
    device_hint: Optional[str] = None   # future: user-agent / device


class CaretakerStatusResponse(BaseModel):
    """Full caretaker access status for patient settings screen."""
    has_caretaker_pin: bool = False
    access_enabled: bool = False
    caretaker_name: Optional[str] = None
    relationship: Optional[str] = None
    patient_id: Optional[str] = None
    last_login: Optional[datetime] = None
    session_count: int = 0
    # JWT info
    session_duration_minutes: int = 60
    pin_version: int = 0    # increments on regenerate — invalidates old JWTs


class CaretakerToken(BaseModel):
    """Extended token response for caretaker logins."""
    access_token: str
    token_type: str = "bearer"
    linked_patient_id: str
    patient_name: str
    caretaker_name: Optional[str] = None
    relationship: Optional[str] = None
    expires_in: int = 3600   # 1 hour short expiry for caretaker sessions
    session_number: int = 0  # incremental session counter


class CaretakerToggleRequest(BaseModel):
    """Patient enables or disables caretaker access without regenerating PIN."""
    enabled: bool


class UserProfile(BaseModel):
    """Safe user profile returned to clients (no password)."""
    user_id: str
    patient_id: Optional[str] = None
    name: str
    email: str
    role: str = "patient"
    age: Optional[int] = None
    gender: Optional[str] = None
    weight: Optional[float] = None
    blood_group: Optional[str] = None
    # Phone Verification
    phone: Optional[str] = None
    phone_verified: bool = False
    # Gamification & Streaks
    current_streak: int = 0
    longest_streak: int = 0
    achievements: List[str] = Field(default_factory=list)
    # Caregiver System
    caregiver_name: Optional[str] = None
    caregiver_phone: Optional[str] = None
    caregiver_relation: Optional[str] = None
    # Caretaker PIN set by patient
    has_caretaker_pin: bool = False
    # Calling Settings
    calling_preferences: CallingPreferences = Field(default_factory=CallingPreferences)
    created_at: datetime


class UserUpdate(BaseModel):
    """Payload for updating user profile."""
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
    """JWT token response."""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Decoded JWT payload data."""
    user_id: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None          # "patient", "doctor", "caretaker"
    pin_version: Optional[int] = None   # caretaker JWTs carry pin_version



# ─── Prescription / Scan ──────────────────────────────────────────────────────

class Medicine(BaseModel):
    """Single medicine extracted from a prescription."""
    name: str = ""
    dosage: str = ""
    morning: bool = False
    afternoon: bool = False
    night: bool = False
    sos: bool = False
    duration: str = ""
    timing: str = "" # Fallback string if needed
    frequency: str = ""
    schedule: List[str] = []               # ["morning", "night"] for backwards compatibility
    expiry_date: Optional[datetime] = None
    confidence: float = 0.0


class ScanResponse(BaseModel):
    """
    Unified response from POST /scan.
    """
    ocr_text: str = ""
    confidence_score: float = 0.0
    medicines: List[Medicine] = []
    schedule: List[str] = []
    doctor_advice: str = ""
    possible_condition: str = ""
    precautions: str = ""
    unmatched_tokens: List[str] = []


# ─── Medication Tracking ──────────────────────────────────────────────────────

class MarkDoneRequest(BaseModel):
    """Request payload for POST /mark-done."""
    med_id: str
    status: Literal["taken", "missed", "skipped"]
    note: Optional[str] = None             # optional caregiver note

class SymptomCreate(BaseModel):
    """Payload for POST /symptoms"""
    user_id: Optional[str] = None
    symptom: str
    severity: int  # 1-5
    time_context: Optional[str] = None # e.g. "before medicine", "after medicine"
    timestamp: Optional[str] = None


class DoseLog(BaseModel):
    """A single dose event stored in dose_logs collection."""
    user_id: str
    med_id: str
    medicine_name: str = ""
    status: Literal["taken", "missed", "skipped", "reminder_sent"]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    scheduled_time: Optional[datetime] = None
    delay_minutes: Optional[int] = 0
    note: Optional[str] = None


# ─── Chatbot ─────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    """
    Request payload for POST /chat.
    user_data: optional medicine/prescription context dict
    language: 'en' for English, 'hi' for Hindi
    """
    user_data: dict = {}
    question: str = Field(..., min_length=1, max_length=1000)
    language: Literal["en", "hi"] = "en"


class ChatResponse(BaseModel):
    """Chatbot response."""
    response: str


# ─── AI Insights ─────────────────────────────────────────────────────────────

class InsightReport(BaseModel):
    """Adherence analysis report generated for a user."""
    user_id: str
    adherence_rate: float = 0.0            # 0.0 – 1.0
    total_doses_expected: int = 0
    total_doses_taken: int = 0
    total_doses_missed: int = 0
    consecutive_misses: int = 0
    risk_level: Literal["low", "medium", "high"] = "low"
    recommendations: List[str] = []
    generated_at: datetime = Field(default_factory=datetime.utcnow)


# ─── Doctor Chat ────────────────────────────────────────────────────────

class DoctorMessageCreate(BaseModel):
    """
    Request payload for POST /doctor/message.
    Sent by a patient to their doctor thread.
    """
    message: str = Field(..., min_length=1, max_length=2000)


class DoctorMessageOut(BaseModel):
    """
    A single doctor-chat message returned to the client.
    """
    id: str                              # MongoDB _id as string
    user_id: str
    doctor_id: Optional[str] = None     # null until a real doctor is assigned
    message: str
    sender: Literal["user", "doctor", "system"]
    read: bool = False
    timestamp: datetime


class DoctorThreadResponse(BaseModel):
    """Response for GET /doctor/messages."""
    messages: List[DoctorMessageOut]
    unread_count: int = 0
    total: int = 0


class DoctorInboxThread(BaseModel):
    patient_id: str
    patient_name: str
    latest_message: str
    timestamp: datetime
    unread_count: int = 0


class DoctorInboxResponse(BaseModel):
    threads: List[DoctorInboxThread]


# ─── Doctor Dashboard Analytics ──────────────────────────────────────────────

class AdherenceStats(BaseModel):
    today_taken: int = 0
    today_missed: int = 0
    weekly_percentage: float = 0.0
    missed_medicines_today: List[str] = Field(default_factory=list)


class GraphData(BaseModel):
    daily_adherence: List[dict] = []      # e.g. [{"day": "Mon", "percentage": 80}]
    missed_vs_taken: dict = {"taken": 0, "missed": 0}
    time_slot_adherence: dict = {"morning": 0, "afternoon": 0, "night": 0}


class PatientProfileOut(BaseModel):
    patient_id: str
    name: str
    age: int = 0
    condition: str = ""
    medicines: List[Medicine] = []
    adherence_stats: AdherenceStats = Field(default_factory=AdherenceStats)
    symptoms: List[str] = []
    risk_level: str = "low"
    graph_data: GraphData = Field(default_factory=GraphData)
    recommendations: List[str] = []


class PatientListOut(BaseModel):
    id: str
    name: str
    age: int = 0
    condition: str = ""
    avatar: str = "👤"
    status: Literal["active", "critical", "stable"] = "active"


class PatientListResponse(BaseModel):
    patients: List[PatientListOut]


# ─── Prescription Intelligence (Advanced /scan/analyze) ──────────────────────

class PrescriptionMedicineDetail(BaseModel):
    """Single medicine with full pharmaceutical intelligence."""
    name: Optional[str] = None
    normalized_name: Optional[str] = None
    dosage: Optional[str] = None
    timing_raw: Optional[str] = None
    timing_interpreted: Optional[str] = None
    duration: Optional[str] = None
    food_instruction: Optional[str] = None
    purpose: Optional[str] = None
    confidence: Optional[str] = None  # "high", "medium", "low"


class PatientSummary(BaseModel):
    """Clinical summary extracted from the prescription."""
    probable_conditions: List[str] = []
    symptoms: List[str] = []
    medical_advice: List[str] = []
    follow_up: Optional[str] = None
    risk_flags: List[str] = []


class PatientMemory(BaseModel):
    """
    Long-term patient memory object for chatbot continuity.
    Accumulated across multiple prescriptions — never replaced, always merged.
    """
    active_conditions: List[str] = []
    chronic_conditions: List[str] = []
    medicine_history: List[str] = []
    allergies: List[str] = []
    health_risks: List[str] = []
    important_notes: List[str] = []


class PrescriptionIntelligenceResponse(BaseModel):
    """
    Full structured response from POST /scan/analyze.
    Contains everything needed for clinical decision support.
    """
    patient_summary: PatientSummary = Field(default_factory=PatientSummary)
    medicines: List[PrescriptionMedicineDetail] = []
    tests_recommended: List[str] = []
    doctor_notes: List[str] = []
    patient_memory: PatientMemory = Field(default_factory=PatientMemory)
    # Audit fields (not in user-facing JSON spec, but stored in DB)
    raw_ocr_text: Optional[str] = None
    ocr_confidence: Optional[float] = None


# ─── Advanced Adherence Analytics ────────────────────────────────────────────

class DailyLogPoint(BaseModel):
    date: str
    status: str
    delay_minutes: int = 0
    medicine: str

class AdherenceAnalyticsResponse(BaseModel):
    """Advanced analytics for charting."""
    adherence_score: int = 0
    weekly_trend: List[dict] = []         # e.g. [{"day": "Mon", "score": 85}, ...]
    missed_medicines: List[str] = []      # list of frequently missed meds
    timing_consistency: dict = {}         # e.g. {"morning": 90, "night": 40}
    delay_stats: dict = {}                # average delay in minutes e.g. {"morning": 15, "afternoon": 0, "night": 45}
    time_windows: dict = {}               # e.g. {"morning": {"start": "08:15", "end": "10:30"}}
    daily_logs: List[DailyLogPoint] = []


class SmartReportResponse(BaseModel):
    """AI-generated smart medicine report."""
    report_text: str
    critical_alerts: List[str] = []
    confidence_score: float = 0.0
    generated_at: datetime = Field(default_factory=datetime.utcnow)


# ─── Voice AI & Reminders ────────────────────────────────────────────────────

class VoiceReminderSchedule(BaseModel):
    """Payload to schedule a voice reminder."""
    user_id: str
    medicine_name: str
    scheduled_time: datetime
    phone_number: str
    language: str = "en"

class VoiceChatStartRequest(BaseModel):
    """Payload to initialize a voice chat session."""
    user_id: str
    language: str = "en"
    emotional_tone: str = "empathetic"

class VoiceChatResponse(BaseModel):
    session_id: str
    websocket_url: str


# ─── Emergency System ─────────────────────────────────────────────────────────

class EmergencyCreate(BaseModel):
    """Payload for POST /emergency/trigger — patient triggers SOS."""
    note: Optional[str] = Field(None, max_length=500)
    location: Optional[str] = None   # optional GPS or address string

class EmergencyOut(BaseModel):
    """A single emergency event returned to the client."""
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
    """Response for GET /emergency/status"""
    has_active: bool = False
    emergency: Optional[EmergencyOut] = None

class EmergencyResolvePayload(BaseModel):
    """Payload for PUT /emergency/resolve"""
    emergency_id: str
    note: Optional[str] = None


# ─── Enhanced Pillbox Dose State ─────────────────────────────────────────────

class DoseMedEntry(BaseModel):
    """Single medicine in a pillbox slot with full dose state."""
    med_id: str
    name: str
    dosage: str = ""
    timing: str = ""        # slot key: morning / afternoon / night
    status: str = "upcoming"  # upcoming/active/late/missed/skipped/taken
    rx_id: str = ""
    is_critical: bool = False
    window_open_ist: str = ""   # e.g. "07:00"
    window_close_ist: str = ""  # e.g. "11:00"
    late_window_ist: str = ""   # e.g. "09:00"
    can_take: bool = False      # True only if status is active or late
    can_skip: bool = False      # True if not yet resolved
    log_id: Optional[str] = None  # reference to the dose_log _id

class PillboxSlotsResponse(BaseModel):
    """Full pillbox response with state-machine aware slots."""
    slots: dict = {}            # { morning: [DoseMedEntry], ... }
    alert_message: Optional[str] = None
    summary: dict = {}          # { total: N, taken: N, missed: N, late: N, upcoming: N }
    last_updated_ist: str = ""


# ─── Patient Medicine Delete ──────────────────────────────────────────────────

class PatientDeleteMedicinePayload(BaseModel):
    """Payload for DELETE /prescription/{rx_id}/medicine/{med_index}"""
    rx_id: str
    med_index: int

