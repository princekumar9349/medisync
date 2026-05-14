from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field

class Medicine(BaseModel):
    name: str = ""
    dosage: str = ""
    morning: bool = False
    afternoon: bool = False
    night: bool = False
    sos: bool = False
    duration: str = ""
    timing: str = ""
    frequency: str = ""
    schedule: List[str] = []
    expiry_date: Optional[datetime] = None
    confidence: float = 0.0

class ScanResponse(BaseModel):
    ocr_text: str = ""
    confidence_score: float = 0.0
    medicines: List[Medicine] = []
    schedule: List[str] = []
    doctor_advice: str = ""
    possible_condition: str = ""
    precautions: str = ""
    unmatched_tokens: List[str] = []

class PrescriptionMedicineDetail(BaseModel):
    name: Optional[str] = None
    normalized_name: Optional[str] = None
    dosage: Optional[str] = None
    timing_raw: Optional[str] = None
    timing_interpreted: Optional[str] = None
    duration: Optional[str] = None
    food_instruction: Optional[str] = None
    purpose: Optional[str] = None
    confidence: Optional[str] = None

class PatientSummary(BaseModel):
    probable_conditions: List[str] = []
    symptoms: List[str] = []
    medical_advice: List[str] = []
    follow_up: Optional[str] = None
    risk_flags: List[str] = []

class PatientMemory(BaseModel):
    active_conditions: List[str] = []
    chronic_conditions: List[str] = []
    medicine_history: List[str] = []
    allergies: List[str] = []
    health_risks: List[str] = []
    important_notes: List[str] = []

class PrescriptionIntelligenceResponse(BaseModel):
    patient_summary: PatientSummary = Field(default_factory=PatientSummary)
    medicines: List[PrescriptionMedicineDetail] = []
    tests_recommended: List[str] = []
    doctor_notes: List[str] = []
    patient_memory: PatientMemory = Field(default_factory=PatientMemory)
    raw_ocr_text: Optional[str] = None
    ocr_confidence: Optional[float] = None

class PatientDeleteMedicinePayload(BaseModel):
    rx_id: str
    med_index: int
