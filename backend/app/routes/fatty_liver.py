"""Fatty Liver Risk Awareness API routes.

Provides non-invasive cardiometabolic risk awareness based on MASLD consensus criteria.
Educational tool only; decoupled from predictive models.
"""

from datetime import date
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.middleware.profile_scope import ProfileScope, get_profile_scope
from app.services import fatty_liver_service

router = APIRouter(prefix="/health/fatty-liver", tags=["Fatty Liver Risk Awareness"])


class FattyLiverRequest(BaseModel):
    screening_date: Optional[date] = None
    bmi: float = Field(..., ge=10.0, le=80.0, description="Body Mass Index (kg/m²)")
    waist_circumference_cm: float = Field(..., ge=40.0, le=250.0, description="Waist circumference in cm")
    has_hypertension: bool = Field(False, description="Treated or diagnosed hypertension (BP ≥ 130/85)")
    has_type2_diabetes_or_prediabetes: bool = Field(False, description="Treated or diagnosed diabetes or prediabetes")
    high_triglycerides: bool = Field(False, description="Plasma triglycerides ≥ 150 mg/dL")
    low_hdl: bool = Field(False, description="Plasma HDL < 40 mg/dL (men) or < 50 mg/dL (women)")
    alcohol_units_weekly: int = Field(0, ge=0, le=100, description="Weekly standard alcoholic drinks")
    alt_u_l: Optional[float] = Field(None, ge=1.0, le=1000.0, description="Optional serum Alanine Aminotransferase (U/L)")
    ast_u_l: Optional[float] = Field(None, ge=1.0, le=1000.0, description="Optional serum Aspartate Aminotransferase (U/L)")
    prior_imaging_steatosis: Optional[str] = Field("UNKNOWN", description="NONE, DETECTED_ULTRASOUND, DETECTED_FIBROSCAN, UNKNOWN")

    @model_validator(mode="before")
    @classmethod
    def normalize_fatty_liver_inputs(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Waist circumference fallback
            if "waist_circumference_cm" not in data:
                if "waist_cm" in data and data["waist_cm"] is not None:
                    data["waist_circumference_cm"] = float(data["waist_cm"])
                else:
                    data["waist_circumference_cm"] = 85.0

            # Default BMI if missing
            if "bmi" not in data or data.get("bmi") is None:
                data["bmi"] = 24.5

            # Diabetes flag fallback
            if "has_type2_diabetes_or_prediabetes" not in data:
                data["has_type2_diabetes_or_prediabetes"] = bool(data.get("has_diabetes", False))

            # Alcohol consumption fallback
            if "alcohol_units_weekly" not in data:
                alc = str(data.get("alcohol_consumption", "")).lower()
                if alc == "heavy":
                    data["alcohol_units_weekly"] = 20
                elif alc == "moderate":
                    data["alcohol_units_weekly"] = 7
                else:
                    data["alcohol_units_weekly"] = 0

            if "prior_imaging_steatosis" not in data:
                data["prior_imaging_steatosis"] = "UNKNOWN"
        return data


class FattyLiverResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    screening_date: date
    bmi: float
    waist_circumference_cm: float
    has_hypertension: bool
    has_type2_diabetes_or_prediabetes: bool
    high_triglycerides: bool
    low_hdl: bool
    alcohol_units_weekly: int
    alt_u_l: Optional[float] = None
    ast_u_l: Optional[float] = None
    prior_imaging_steatosis: Optional[str] = None
    metabolic_factors_count: int
    risk_level: str
    risk_summary: str
    educational_guidance: str


@router.post("/evaluate", response_model=Dict[str, Any])
def preview_fatty_liver_risk(payload: FattyLiverRequest):
    """Educational preview of cardiometabolic liver risk factors without database write."""
    return fatty_liver_service.evaluate_fatty_liver_risk(
        bmi=payload.bmi,
        waist_circumference_cm=payload.waist_circumference_cm,
        has_hypertension=payload.has_hypertension,
        has_type2_diabetes_or_prediabetes=payload.has_type2_diabetes_or_prediabetes,
        high_triglycerides=payload.high_triglycerides,
        low_hdl=payload.low_hdl,
        alcohol_units_weekly=payload.alcohol_units_weekly,
        alt_u_l=payload.alt_u_l,
        ast_u_l=payload.ast_u_l,
        prior_imaging_steatosis=payload.prior_imaging_steatosis,
    )


@router.post("/screen", response_model=FattyLiverResponse, status_code=status.HTTP_201_CREATED)
def submit_fatty_liver_screening(
    payload: FattyLiverRequest,
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Submit an educational fatty liver risk awareness assessment for active profile."""
    if not scope.can_write:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Write permission required to record health screenings",
        )

    return fatty_liver_service.record_fatty_liver_screening(
        db=db,
        user_id=scope.owner_id,
        data=payload.model_dump(),
        care_profile_id=scope.profile_id,
        screening_date=payload.screening_date or date.today(),
    )


@router.get("/history", response_model=List[FattyLiverResponse])
def get_fatty_liver_history(
    limit: int = Query(20, ge=1, le=100),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Retrieve historical fatty liver risk awareness screenings for active profile."""
    return fatty_liver_service.get_fatty_liver_history(
        db=db,
        user_id=scope.owner_id,
        care_profile_id=scope.profile_id,
        limit=limit,
    )
