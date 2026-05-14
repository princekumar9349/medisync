"""
analytics/schemas/models.py

Pydantic response models for all /analytics/* endpoints.
These define the public API contract — field names and types must not change
without a versioning strategy.
"""

from typing import Optional
from pydantic import BaseModel


class AdherenceInfo(BaseModel):
    score_7d: float
    score_30d: float
    consistency_score: float
    streak_current: int
    streak_longest: int
    confidence: str   # HIGH | MEDIUM | LOW
    taken_7d: int
    total_7d: int


class RiskInfo(BaseModel):
    level: str        # LOW | MODERATE | HIGH | CRITICAL
    score: int
    factors: list[str]
    missed_7d: int
    escalations_7d: int


class NotificationInfo(BaseModel):
    sent_7d: int
    tapped_7d: int
    tap_through_rate: float
    ignored_7d: int


class CaregiverInfo(BaseModel):
    alerts_sent_7d: int
    avg_response_latency_min: Optional[float]
    interventions_7d: int


class UserAnalyticsSummary(BaseModel):
    adherence: AdherenceInfo
    risk: RiskInfo
    notification: NotificationInfo
    caregiver: CaregiverInfo
    updated_at: Optional[str] = None


class TrendDataPoint(BaseModel):
    date: str
    taken: int
    missed: int
    skipped: int
    score_pct: Optional[float]
    status: str   # excellent | good | fair | poor | no_data


class TimelineEvent(BaseModel):
    timestamp: str
    event_type: str
    medicine_name: Optional[str] = None
    slot: Optional[str] = None
    metadata: dict = {}


class AIMetricsSummary(BaseModel):
    total_requests: int
    cache_hit_rate: float
    fallback_rate: float
    degraded_rate: float
    avg_latency_ms: float
    provider_breakdown: dict
    window_hours: int


class DoctorPatientRiskItem(BaseModel):
    user_id: str
    name: Optional[str] = None
    adherence_7d: float
    risk_level: str
    risk_score: int
    missed_7d: int
    escalations_7d: int
