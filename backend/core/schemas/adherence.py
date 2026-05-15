from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field

class MarkDoneRequest(BaseModel):
    med_id: str
    status: Literal["taken", "missed", "skipped"]
    note: Optional[str] = None
    slot: Optional[str] = None
    authoritative_time: Optional[str] = None
    source: Literal["mobile", "iot", "voice_ai"] = "mobile"

class SymptomCreate(BaseModel):
    user_id: Optional[str] = None
    symptom: str
    severity: int
    time_context: Optional[str] = None
    timestamp: Optional[str] = None

class DoseLog(BaseModel):
    user_id: str
    med_id: str
    medicine_name: str = ""
    status: Literal["taken", "missed", "skipped", "reminder_sent"]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    scheduled_time: Optional[datetime] = None
    delay_minutes: Optional[int] = 0
    note: Optional[str] = None
    source: Literal["mobile", "iot", "voice_ai"] = "mobile"

class DailyLogPoint(BaseModel):
    date: str
    status: str
    delay_minutes: int = 0
    medicine: str

class AdherenceAnalyticsResponse(BaseModel):
    adherence_score: int = 0
    weekly_trend: List[dict] = []
    missed_medicines: List[str] = []
    timing_consistency: dict = {}
    delay_stats: dict = {}
    time_windows: dict = {}
    daily_logs: List[DailyLogPoint] = []

class InsightReport(BaseModel):
    user_id: str
    adherence_rate: float = 0.0
    total_doses_expected: int = 0
    total_doses_taken: int = 0
    total_doses_missed: int = 0
    consecutive_misses: int = 0
    risk_level: Literal["low", "medium", "high"] = "low"
    recommendations: List[str] = []
    generated_at: datetime = Field(default_factory=datetime.utcnow)

class DoseMedEntry(BaseModel):
    med_id: str
    name: str
    dosage: str = ""
    timing: str = ""
    status: str = "upcoming"
    rx_id: str = ""
    is_critical: bool = False
    window_open_ist: str = ""
    window_close_ist: str = ""
    late_window_ist: str = ""
    can_take: bool = False
    can_skip: bool = False
    log_id: Optional[str] = None

class PillboxSlotsResponse(BaseModel):
    slots: dict = {}
    alert_message: Optional[str] = None
    summary: dict = {}
    last_updated_ist: str = ""
