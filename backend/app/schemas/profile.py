"""Profile schemas with medically sensible range validation."""

from datetime import date
from decimal import Decimal
import re
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

BloodType = Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]


class ProfileUpdate(BaseModel):
    """Partial update: only fields the client sends are changed."""

    model_config = ConfigDict(extra="forbid")

    # account fields (users table)
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=20)
    date_of_birth: Optional[date] = None
    gender: Optional[Literal["MALE", "FEMALE", "OTHER"]] = None
    timezone: Optional[str] = Field(default=None, max_length=64)

    # physical (user_profiles table)
    height_cm: Optional[Decimal] = Field(default=None, ge=50, le=250, decimal_places=2)
    weight_kg: Optional[Decimal] = Field(default=None, ge=20, le=400, decimal_places=2)
    waist_circumference_cm: Optional[Decimal] = Field(default=None, ge=30, le=250, decimal_places=2)
    blood_type: Optional[BloodType] = None

    # lifestyle
    exercise_frequency: Optional[Literal["SEDENTARY", "LIGHT", "MODERATE", "ACTIVE", "VERY_ACTIVE"]] = None
    sleep_duration_hours: Optional[Decimal] = Field(default=None, ge=0, le=24, decimal_places=2)
    smoking_status: Optional[Literal["NEVER", "FORMER", "CURRENT"]] = None
    alcohol_consumption: Optional[Literal["NEVER", "OCCASIONALLY", "REGULARLY", "HEAVILY"]] = None
    cholesterol_level: Optional[Literal["NORMAL", "ABOVE_NORMAL", "WELL_ABOVE_NORMAL"]] = None
    diet_type: Optional[str] = Field(default=None, max_length=100)
    water_intake_goal_ml: Optional[int] = Field(default=None, ge=500, le=10000)

    # background
    allergies: Optional[list[str]] = Field(default=None, max_length=50)
    existing_conditions: Optional[list[str]] = Field(default=None, max_length=50)
    family_history: Optional[list[str]] = Field(default=None, max_length=50)

    emergency_contact_name: Optional[str] = Field(default=None, max_length=255)
    emergency_contact_phone: Optional[str] = Field(default=None, max_length=20)

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, v):
        if v is None:
            return v
        v = v.strip()
        try:
            from zoneinfo import ZoneInfo
            ZoneInfo(v)
        except Exception:
            raise ValueError(f"Invalid IANA timezone: '{v}'")
        return v

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, v):
        if v is None:
            return v
        # Strip HTML tags and angle brackets to prevent stored XSS
        v = re.sub(r'<[^>]*>', '', v).strip()
        v = v.replace('<', '').replace('>', '').strip()
        if len(v) < 2:
            raise ValueError("Full name must be at least 2 characters")
        return v

    @field_validator("date_of_birth")
    @classmethod
    def _dob(cls, v):
        if v is not None and (v > date.today() or v.year < 1900):
            raise ValueError("Date of birth is not valid")
        return v

    @field_validator("allergies", "existing_conditions", "family_history")
    @classmethod
    def _clean_lists(cls, v):
        if v is None:
            return v
        cleaned = [s.strip() for s in v if s and s.strip()]
        if any(len(s) > 100 for s in cleaned):
            raise ValueError("Each entry must be at most 100 characters")
        return cleaned


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    height_cm: Optional[Decimal] = None
    weight_kg: Optional[Decimal] = None
    bmi: Optional[Decimal] = None
    waist_circumference_cm: Optional[Decimal] = None
    blood_type: Optional[str] = None
    exercise_frequency: Optional[str] = None
    sleep_duration_hours: Optional[Decimal] = None
    smoking_status: Optional[str] = None
    alcohol_consumption: Optional[str] = None
    cholesterol_level: Optional[str] = None
    diet_type: Optional[str] = None
    water_intake_goal_ml: Optional[int] = None
    allergies: Optional[list[str]] = None
    existing_conditions: Optional[list[str]] = None
    family_history: Optional[list[str]] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
