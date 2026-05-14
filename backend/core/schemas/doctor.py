from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field
from .prescription import Medicine

class DoctorMessageCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)

class DoctorMessageOut(BaseModel):
    id: str
    user_id: str
    doctor_id: Optional[str] = None
    message: str
    sender: Literal["user", "doctor", "system"]
    read: bool = False
    timestamp: datetime

class DoctorThreadResponse(BaseModel):
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

class AdherenceStats(BaseModel):
    today_taken: int = 0
    today_missed: int = 0
    weekly_percentage: float = 0.0
    missed_medicines_today: List[str] = Field(default_factory=list)

class GraphData(BaseModel):
    daily_adherence: List[dict] = []
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
