"""Medicine request/response schemas."""

import re
from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

FormLiteral = Literal["TABLET", "CAPSULE", "LIQUID", "INJECTION", "PATCH", "OTHER"]
FrequencyUnitLiteral = Literal["DAILY", "WEEKLY", "MONTHLY", "AS_NEEDED"]
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class MedicineCreate(BaseModel):
    medicine_name: str = Field(min_length=1, max_length=255)
    dosage: Optional[Decimal] = Field(default=None, gt=0, le=100000, decimal_places=2)
    dosage_unit: Optional[str] = Field(default=None, max_length=50)
    form: FormLiteral = "TABLET"
    frequency_unit: FrequencyUnitLiteral = "DAILY"
    time_of_day: list[str] = Field(default_factory=list)
    weekdays: Optional[list[int]] = Field(default=None)  # 0=Monday..6=Sunday
    month_day: Optional[int] = Field(default=None, ge=1, le=31)
    start_date: date
    end_date: Optional[date] = None
    instructions: Optional[str] = Field(default=None, max_length=2000)
    reason_for_use: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = Field(default=None, max_length=2000)
    rxcui: Optional[str] = Field(default=None, max_length=50)
    quantity_on_hand: Optional[int] = Field(default=None, ge=0)
    pills_per_dose: Optional[int] = Field(default=1, ge=1)
    refill_threshold_days: Optional[int] = Field(default=7, ge=1)
    pharmacy_note: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("medicine_name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Medicine name cannot be blank")
        return v

    @field_validator("time_of_day")
    @classmethod
    def _valid_times(cls, v: list[str]) -> list[str]:
        for t in v:
            if not _TIME_RE.match(t):
                raise ValueError(f"'{t}' is not a valid 24-hour HH:MM time")
        if len(set(v)) != len(v):
            raise ValueError("Duplicate times in time_of_day")
        return sorted(v)

    @field_validator("weekdays")
    @classmethod
    def _valid_weekdays(cls, v: Optional[list[int]]) -> Optional[list[int]]:
        if v is None:
            return v
        for day in v:
            if not isinstance(day, int) or day < 0 or day > 6:
                raise ValueError("Weekdays must be integers between 0 (Monday) and 6 (Sunday)")
        return sorted(set(v))

    @model_validator(mode="after")
    def _time_of_day_matches_frequency(self):
        if self.frequency_unit == "AS_NEEDED":
            if self.time_of_day:
                raise ValueError("AS_NEEDED medicines should not specify time_of_day")
        elif not self.time_of_day:
            raise ValueError("time_of_day is required unless frequency_unit is AS_NEEDED")
        elif self.frequency_unit == "DAILY" and len(self.time_of_day) > 10:
            raise ValueError("That's an unusually high number of daily doses - please check time_of_day")
        return self

    @field_validator("end_date")
    @classmethod
    def _end_after_start(cls, v, info):
        start = info.data.get("start_date")
        if v is not None and start is not None and v < start:
            raise ValueError("end_date cannot be before start_date")
        return v


class MedicineUpdate(BaseModel):
    """Partial update. Changing schedule-affecting fields (frequency_unit, time_of_day,
    start_date, end_date, weekdays, month_day) regenerates future (not-yet-occurred) schedule entries only -
    see medicine_service.py."""

    model_config = ConfigDict(extra="forbid")

    medicine_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    dosage: Optional[Decimal] = Field(default=None, gt=0, le=100000, decimal_places=2)
    dosage_unit: Optional[str] = Field(default=None, max_length=50)
    form: Optional[FormLiteral] = None
    frequency_unit: Optional[FrequencyUnitLiteral] = None
    time_of_day: Optional[list[str]] = None
    weekdays: Optional[list[int]] = None
    month_day: Optional[int] = Field(default=None, ge=1, le=31)
    end_date: Optional[date] = None
    instructions: Optional[str] = Field(default=None, max_length=2000)
    reason_for_use: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = Field(default=None, max_length=2000)
    rxcui: Optional[str] = Field(default=None, max_length=50)
    quantity_on_hand: Optional[int] = Field(default=None, ge=0)
    pills_per_dose: Optional[int] = Field(default=None, ge=1)
    refill_threshold_days: Optional[int] = Field(default=None, ge=1)
    pharmacy_note: Optional[str] = Field(default=None, max_length=2000)
    is_active: Optional[bool] = None  # pause (false) / resume (true)

    @field_validator("time_of_day")
    @classmethod
    def _valid_times(cls, v):
        if v is None:
            return v
        for t in v:
            if not _TIME_RE.match(t):
                raise ValueError(f"'{t}' is not a valid 24-hour HH:MM time")
        return sorted(set(v))

    @field_validator("weekdays")
    @classmethod
    def _valid_weekdays(cls, v: Optional[list[int]]) -> Optional[list[int]]:
        if v is None:
            return v
        for day in v:
            if not isinstance(day, int) or day < 0 or day > 6:
                raise ValueError("Weekdays must be integers between 0 (Monday) and 6 (Sunday)")
        return sorted(set(v))


class MedicineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    medicine_name: str
    dosage: Optional[Decimal] = None
    dosage_unit: Optional[str] = None
    form: str
    frequency_unit: str
    time_of_day: list[str] = Field(default_factory=list)
    weekdays: Optional[list[int]] = None
    month_day: Optional[int] = None
    start_date: date
    end_date: Optional[date] = None
    instructions: Optional[str] = None
    reason_for_use: Optional[str] = None
    notes: Optional[str] = None
    rxcui: Optional[str] = None
    quantity_on_hand: Optional[int] = None
    pills_per_dose: Optional[int] = 1
    refill_threshold_days: Optional[int] = 7
    days_left: Optional[int] = None
    pharmacy_note: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime] = None



class ScheduleEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    medicine_id: int
    medicine_name: Optional[str] = None  # populated for cross-medicine "today" views
    scheduled_date: date
    scheduled_time: Optional[time] = None
    is_taken: bool
    is_skipped: bool
    taken_at: Optional[datetime] = None
    skipped_reason: Optional[str] = None
    dosage_at_intake: Optional[Decimal] = None
    dosage_unit_at_intake: Optional[str] = None
    dosage: Optional[Decimal] = None
    dosage_unit: Optional[str] = None
    quantity_on_hand: Optional[int] = None
    days_left: Optional[int] = None


class RefillRequest(BaseModel):
    quantity: int = Field(..., gt=0)
    pharmacy_note: Optional[str] = Field(default=None, max_length=2000)


class MedicineScanDraft(BaseModel):
    medicine_name: str
    dosage: Optional[Decimal] = None
    dosage_unit: Optional[str] = None
    form: FormLiteral = "TABLET"
    instructions: Optional[str] = None
    rxcui: Optional[str] = None
    raw_detected_text: Optional[str] = None



class LogSkippedRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=255)


class AdherenceOut(BaseModel):
    medicine_id: int
    days: int
    scheduled_count: int
    taken_count: int
    skipped_count: int
    missed_count: int
    adherence_percent: float


class OverallAdherenceOut(BaseModel):
    """Adherence across all active medicines. adherence_percent is null when nothing has been scheduled yet."""
    days: int
    scheduled_count: int
    taken_count: int
    skipped_count: int
    missed_count: int
    adherence_percent: Optional[float] = None
