"""Pydantic schemas for emergency card, symptom diary, and doctor appointments."""

from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.models.emergency_and_symptoms import AppointmentStatus


# ──────────────────────────────────────────────
# Emergency Card
# ──────────────────────────────────────────────

class EmergencyCardUpdate(BaseModel):
    blood_type: Optional[str] = Field(None, max_length=10)
    allergies: Optional[List[str]] = None
    chronic_conditions: Optional[List[str]] = None
    current_medications: Optional[List[str]] = None
    emergency_contact_name: Optional[str] = Field(None, max_length=255)
    emergency_contact_phone: Optional[str] = Field(None, max_length=30)
    emergency_contact_relationship: Optional[str] = Field(None, max_length=100)
    organ_donor: Optional[bool] = None
    medical_notes: Optional[str] = None
    is_public: Optional[bool] = None
    consent_acknowledged: Optional[bool] = None


class EmergencyCardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    public_token: str
    blood_type: Optional[str] = None
    allergies: Optional[List[str]] = None
    chronic_conditions: Optional[List[str]] = None
    current_medications: Optional[List[str]] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    organ_donor: bool
    medical_notes: Optional[str] = None
    is_public: bool
    expires_at: Optional[datetime] = None
    updated_at: datetime


class PublicEmergencyCardOut(BaseModel):
    """Public view — no user_id / internal fields."""
    model_config = ConfigDict(from_attributes=True)

    blood_type: Optional[str] = None
    allergies: Optional[List[str]] = None
    chronic_conditions: Optional[List[str]] = None
    current_medications: Optional[List[str]] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    organ_donor: bool
    medical_notes: Optional[str] = None
    expires_at: Optional[datetime] = None
    updated_at: datetime


# ──────────────────────────────────────────────
# Symptom Log & Analytics
# ──────────────────────────────────────────────

class SymptomLogCreate(BaseModel):
    symptom_name: str = Field(..., min_length=1, max_length=255)
    severity: int = Field(..., ge=1, le=5)
    notes: Optional[str] = None


class SymptomLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    symptom_name: str
    severity: int
    notes: Optional[str] = None
    logged_at: datetime
    created_at: datetime


class SymptomItemBreakdown(BaseModel):
    symptom_name: str
    frequency: int
    average_severity: float
    max_severity: int
    trend: str  # INCREASING, DECREASING, STABLE


class SymptomTimelinePoint(BaseModel):
    date: str
    count: int
    max_severity: int


class SymptomAnalyticsOut(BaseModel):
    days_analyzed: int
    total_logs: int
    unique_symptoms: int
    overall_average_severity: float
    symptom_breakdown: List[SymptomItemBreakdown]
    timeline: List[SymptomTimelinePoint]


# ──────────────────────────────────────────────
# Doctor Appointments & Preparation
# ──────────────────────────────────────────────

class AppointmentCreate(BaseModel):
    doctor_name: str = Field(..., min_length=1, max_length=255)
    specialty: Optional[str] = Field(None, max_length=100)
    location: Optional[str] = Field(None, max_length=255)
    appointment_date: datetime
    reason_for_visit: Optional[str] = Field(None, max_length=255)
    questions_to_ask: Optional[List[str]] = None
    doctor_notes: Optional[str] = None
    followup_date: Optional[date] = None


class AppointmentUpdate(BaseModel):
    doctor_name: Optional[str] = Field(None, min_length=1, max_length=255)
    specialty: Optional[str] = Field(None, max_length=100)
    location: Optional[str] = Field(None, max_length=255)
    appointment_date: Optional[datetime] = None
    reason_for_visit: Optional[str] = Field(None, max_length=255)
    questions_to_ask: Optional[List[str]] = None
    doctor_notes: Optional[str] = None
    followup_date: Optional[date] = None
    status: Optional[AppointmentStatus] = None


class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doctor_name: str
    specialty: Optional[str] = None
    location: Optional[str] = None
    appointment_date: datetime
    reason_for_visit: Optional[str] = None
    questions_to_ask: Optional[List[str]] = None
    doctor_notes: Optional[str] = None
    followup_date: Optional[date] = None
    status: AppointmentStatus
    created_at: datetime


class AppointmentPrepOut(BaseModel):
    appointment: Dict[str, Any]
    active_medications: List[Dict[str, Any]]
    recent_symptoms: List[Dict[str, Any]]
    latest_assessment: Optional[Dict[str, Any]] = None
