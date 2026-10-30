"""Health assessment request/response schemas.

Vital-sign ranges are generous physiological limits (not diagnostic thresholds) - they exist to
catch typos and impossible values, not to judge the reading. At least one vital must be supplied;
blood pressure must be given as a pair (both systolic and diastolic, or neither) since scoring it
alone would be meaningless.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AssessmentCreate(BaseModel):
    systolic_bp: Optional[int] = Field(default=None, ge=60, le=260)
    diastolic_bp: Optional[int] = Field(default=None, ge=30, le=200)
    heart_rate_bpm: Optional[int] = Field(default=None, ge=30, le=220)
    blood_glucose_mg_dl: Optional[int] = Field(default=None, ge=20, le=600)
    spo2_percent: Optional[Decimal] = Field(default=None, ge=50, le=100, decimal_places=2)
    temperature_celsius: Optional[Decimal] = Field(default=None, ge=30, le=43, decimal_places=2)
    assessment_notes: Optional[str] = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _bp_is_a_pair(self):
        if (self.systolic_bp is None) != (self.diastolic_bp is None):
            raise ValueError("Provide both systolic and diastolic blood pressure, or neither")
        return self

    @model_validator(mode="after")
    def _at_least_one_vital(self):
        if not any([self.systolic_bp, self.heart_rate_bpm, self.blood_glucose_mg_dl,
                   self.spo2_percent, self.temperature_celsius]):
            raise ValueError("Provide at least one vital sign (blood pressure, heart rate, "
                             "glucose, SpO2, or temperature)")
        return self


class ComponentOut(BaseModel):
    key: str
    label: str
    score: int
    weight_pct: float


class SkippedComponentOut(BaseModel):
    key: str
    label: str
    reason: str


class ScoreBreakdownOut(BaseModel):
    components: list[ComponentOut]
    skipped: list[SkippedComponentOut]


class PredictionFactorOut(BaseModel):
    key: str
    label: str
    direction: str  # "increases" | "decreases"
    relative_strength: float
    shap_value_log_odds: float


class MLPredictionOut(BaseModel):
    probability: float
    risk_level: str
    confidence_percent: float
    model_version: str
    top_factors: list[PredictionFactorOut]
    explanation_text: str
    disclaimer: str
    clinical_context: Optional[str] = None
    recommended_discussions: list[str] = Field(default_factory=list)


class AssessmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    assessment_date: date
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    heart_rate_bpm: Optional[int] = None
    blood_glucose_mg_dl: Optional[int] = None
    spo2_percent: Optional[Decimal] = None
    temperature_celsius: Optional[Decimal] = None
    health_score: Optional[Decimal] = None
    risk_category: str
    data_completeness_percent: Optional[Decimal] = None
    assessment_notes: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None
    score_breakdown: Optional[ScoreBreakdownOut] = None
    disclaimer: str
    glucose_caveat: Optional[str] = None
    profile_hints: list[str] = Field(default_factory=list)
    is_stale: bool = False
    stale_reasons: list[str] = Field(default_factory=list)
    clinical_context: Optional[str] = None
    recommended_discussions: list[str] = Field(default_factory=list)

    # ML prediction (Phase 4/5 model) - a separate, independently-computed number from the
    # rule-based health_score above. Exactly one of ml_prediction / ml_prediction_missing_fields
    # is populated when a prediction isn't available, so the UI can tell "add this info" apart
    # from "nothing to add, the model just isn't available right now".
    ml_prediction: Optional[MLPredictionOut] = None
    ml_prediction_missing_fields: list[str] = Field(default_factory=list)
    ml_prediction_notice: Optional[str] = None


class AssessmentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    assessment_date: date
    health_score: Optional[Decimal] = None
    risk_category: str
    data_completeness_percent: Optional[Decimal] = None
    created_at: Optional[datetime] = None


class AssessmentPage(BaseModel):
    items: list[AssessmentSummary]
    total: int
    page: int
    page_size: int


class HistoryPoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tracking_date: date
    health_score: Optional[Decimal] = None
    bmi: Optional[Decimal] = None
    weight_kg: Optional[Decimal] = None
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    heart_rate_bpm: Optional[int] = None
    blood_glucose_mg_dl: Optional[int] = None
    spo2_percent: Optional[Decimal] = None
    risk_category: str


class HistoryOut(BaseModel):
    days: int
    points: list[HistoryPoint]
