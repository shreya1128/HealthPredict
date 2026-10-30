"""Menstrual cycle tracking & PCOS educational screening API routes.

Provides respectful, user-controlled cycle tracking, duration calculations,
and educational Rotterdam-aligned PCOS symptom evaluation.
Decoupled from ML predictions; explicit privacy deletion controls.
"""

from datetime import date
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.middleware.profile_scope import ProfileScope, get_profile_scope
from app.services import menstrual_service

router = APIRouter(prefix="/health/menstrual", tags=["Menstrual Tracking & PCOS Support"])


class MenstrualLogRequest(BaseModel):
    period_start_date: date
    period_end_date: Optional[date] = None
    flow_intensity: Optional[str] = Field(None, description="LIGHT, MEDIUM, HEAVY, or SPOTTING")
    pain_level: Optional[int] = Field(None, ge=0, le=10, description="Pain rating 0-10")
    symptoms: Optional[List[str]] = Field(default_factory=list)
    notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_inputs(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Accept period_start as period_start_date
            if "period_start_date" not in data and "period_start" in data:
                data["period_start_date"] = data["period_start"]
            # Accept period_end as period_end_date
            if "period_end_date" not in data and "period_end" in data:
                data["period_end_date"] = data["period_end"]
            # Normalize flow intensity
            if "flow_intensity" in data and isinstance(data["flow_intensity"], str):
                data["flow_intensity"] = data["flow_intensity"].strip().upper()
        return data


class MenstrualLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    period_start_date: date
    period_end_date: Optional[date] = None
    period_duration_days: Optional[int] = None
    cycle_length_days: Optional[int] = None
    flow_intensity: Optional[str] = None
    pain_level: Optional[int] = None
    symptoms: Optional[List[str]] = None
    notes: Optional[str] = None


class PCOSEvaluationRequest(BaseModel):
    cycle_regularity: str = Field(..., description="REGULAR, IRREGULAR, INFREQUENT, or ABSENT")
    excess_androgen_symptoms: List[str] = Field(default_factory=list, description="HIRSUTISM, ACNE, ALOPECIA")
    metabolic_indicators: List[str] = Field(default_factory=list, description="WEIGHT_GAIN, ACANTHOSIS_NIGRICANS")
    ultrasound_findings: Optional[str] = Field("NOT_DONE", description="NOT_DONE, NORMAL, POLYCYSTIC_MORPHOLOGY")

    @model_validator(mode="before")
    @classmethod
    def normalize_pcos_inputs(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # If mobile sent irregular_cycles boolean
            if "cycle_regularity" not in data:
                is_irreg = data.get("irregular_cycles")
                if is_irreg is True or str(is_irreg).lower() in ("yes", "true", "1"):
                    data["cycle_regularity"] = "IRREGULAR"
                else:
                    data["cycle_regularity"] = "REGULAR"

            if "excess_androgen_symptoms" not in data or not data.get("excess_androgen_symptoms"):
                androgens = []
                if data.get("excess_hair_growth") in (True, "yes", "true", "1"):
                    androgens.append("HIRSUTISM")
                if data.get("hair_thinning") in (True, "yes", "true", "1"):
                    androgens.append("ALOPECIA")
                acne = str(data.get("acne_severity", "")).lower()
                if acne in ("mild", "moderate", "severe"):
                    androgens.append("ACNE")
                data["excess_androgen_symptoms"] = androgens

            if "metabolic_indicators" not in data or not data.get("metabolic_indicators"):
                metabolic = []
                if data.get("weight_gain_difficulty") in (True, "yes", "true", "1"):
                    metabolic.append("WEIGHT_GAIN")
                data["metabolic_indicators"] = metabolic

            if "ultrasound_findings" not in data:
                data["ultrasound_findings"] = "NOT_DONE"
        return data


class PCOSScreeningResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    screening_date: date
    cycle_regularity: str
    excess_androgen_symptoms: List[str]
    metabolic_indicators: List[str]
    ultrasound_findings: Optional[str] = None
    symptom_count: int
    risk_assessment_text: str
    educational_guidance: str


# ------------------ Menstrual Tracking Endpoints ------------------

@router.post("/logs", response_model=MenstrualLogResponse, status_code=status.HTTP_201_CREATED)
def create_period_log(
    payload: MenstrualLogRequest,
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Record a period log with automated duration and cycle length calculations."""
    if not scope.can_write:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Write permission required to record menstrual logs",
        )

    return menstrual_service.record_menstrual_log(
        db=db,
        user_id=scope.owner_id,
        period_start_date=payload.period_start_date,
        care_profile_id=scope.profile_id,
        period_end_date=payload.period_end_date,
        flow_intensity=payload.flow_intensity,
        pain_level=payload.pain_level,
        symptoms=payload.symptoms,
        notes=payload.notes,
    )


@router.get("/logs", response_model=List[MenstrualLogResponse])
def list_period_logs(
    limit: int = Query(50, ge=1, le=100),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Retrieve menstrual log history for active profile."""
    return menstrual_service.get_menstrual_logs(
        db=db,
        user_id=scope.owner_id,
        care_profile_id=scope.profile_id,
        limit=limit,
    )


@router.delete("/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_period_log(
    log_id: int,
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Privacy-first deletion of a menstrual log record."""
    if not scope.can_write:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Write permission required to delete logs",
        )

    deleted = menstrual_service.delete_menstrual_log(db=db, log_id=log_id, user_id=scope.owner_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menstrual log not found")
    return None


@router.get("/analytics", response_model=Dict[str, Any])
def get_cycle_analytics(
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Calculate cycle length, regularity statistics, and trend summaries."""
    return menstrual_service.get_cycle_analytics(
        db=db,
        user_id=scope.owner_id,
        care_profile_id=scope.profile_id,
    )


# ------------------ PCOS Educational Screening Endpoints ------------------

@router.post("/pcos/evaluate", response_model=Dict[str, Any])
def preview_pcos_evaluation(payload: PCOSEvaluationRequest):
    """Educational preview of PCOS symptom questionnaire without saving to database."""
    return menstrual_service.evaluate_pcos_symptoms(
        cycle_regularity=payload.cycle_regularity,
        excess_androgen_symptoms=payload.excess_androgen_symptoms,
        metabolic_indicators=payload.metabolic_indicators,
        ultrasound_findings=payload.ultrasound_findings,
    )


@router.post("/pcos/screen", response_model=PCOSScreeningResponse, status_code=status.HTTP_201_CREATED)
def submit_pcos_screening(
    payload: PCOSEvaluationRequest,
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Submit an educational PCOS symptom screening for the active profile."""
    if not scope.can_write:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Write permission required to record health screenings",
        )

    return menstrual_service.record_pcos_screening(
        db=db,
        user_id=scope.owner_id,
        data=payload.model_dump(),
        care_profile_id=scope.profile_id,
    )
