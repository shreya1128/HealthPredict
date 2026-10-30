"""Diabetes Risk Assessment API routes.

Provides non-invasive type 2 diabetes risk screening based on validated FINDRISC / ADA standards.
Decoupled from cardiovascular machine learning assessments. Educational risk awareness only.
"""

from datetime import date
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.middleware.profile_scope import ProfileScope, get_profile_scope
from app.services import diabetes_service

router = APIRouter(prefix="/health/diabetes", tags=["Diabetes Risk Assessment"])


class DiabetesScreeningRequest(BaseModel):
    screening_date: Optional[date] = None
    age: int = Field(..., ge=1, le=120, description="Age in years")
    gender: str = Field("MALE", description="MALE, FEMALE, or OTHER")
    bmi: float = Field(..., ge=10.0, le=80.0, description="Body Mass Index (kg/m²)")
    waist_circumference_cm: float = Field(..., ge=40.0, le=250.0, description="Waist circumference in cm")
    physical_activity_daily_30m: bool = Field(..., description="At least 30 minutes of physical activity daily")
    daily_fruits_vegetables: bool = Field(..., description="Eats vegetables, fruits, or berries daily")
    hypertension_meds: bool = Field(..., description="Regularly takes medication for high blood pressure")
    history_high_blood_glucose: bool = Field(..., description="Ever found to have high blood glucose (e.g. checkup, gestational)")
    family_history_diabetes: str = Field("NONE", description="NONE, SECOND_DEGREE, or FIRST_DEGREE")
    fasting_glucose_mg_dl: Optional[float] = Field(None, ge=30.0, le=600.0, description="Optional fasting blood glucose (mg/dL)")
    hba1c_percent: Optional[float] = Field(None, ge=3.0, le=20.0, description="Optional Glycated Hemoglobin (%)")

    @model_validator(mode="before")
    @classmethod
    def normalize_inputs(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # age_group fallback
            if "age" not in data or data.get("age") is None:
                ag = data.get("age_group")
                if ag == "under_45":
                    data["age"] = 35
                elif ag == "45_54":
                    data["age"] = 50
                elif ag == "55_64":
                    data["age"] = 60
                elif ag == "65_plus":
                    data["age"] = 70
                else:
                    data["age"] = 40

            # waist_circumference fallback
            if "waist_circumference_cm" not in data or data.get("waist_circumference_cm") is None:
                wc = data.get("waist_circumference")
                if isinstance(wc, (int, float)):
                    data["waist_circumference_cm"] = float(wc)
                elif wc == "normal":
                    data["waist_circumference_cm"] = 80.0
                elif wc == "elevated":
                    data["waist_circumference_cm"] = 92.0
                elif wc == "high":
                    data["waist_circumference_cm"] = 104.0
                else:
                    data["waist_circumference_cm"] = 85.0

            # physical activity
            if "physical_activity_daily_30m" not in data:
                pa = data.get("physical_activity")
                if isinstance(pa, bool):
                    data["physical_activity_daily_30m"] = pa
                elif pa == "active":
                    data["physical_activity_daily_30m"] = True
                else:
                    data["physical_activity_daily_30m"] = False

            # daily vegetables/fruits
            if "daily_fruits_vegetables" not in data:
                data["daily_fruits_vegetables"] = bool(data.get("daily_vegetables_fruits", True))

            # hypertension
            if "hypertension_meds" not in data:
                data["hypertension_meds"] = bool(data.get("hypertension_medication", False))

            # history high glucose
            if "history_high_blood_glucose" not in data:
                data["history_high_blood_glucose"] = bool(data.get("history_high_glucose", False))

            # family history
            if "family_history_diabetes" not in data:
                fh = str(data.get("family_diabetes_history", "NONE")).lower()
                if fh in ("parent_sibling_child", "close", "first_degree"):
                    data["family_history_diabetes"] = "FIRST_DEGREE"
                elif fh in ("grandparent_uncle_aunt_cousin", "distant", "second_degree"):
                    data["family_history_diabetes"] = "SECOND_DEGREE"
                else:
                    data["family_history_diabetes"] = "NONE"
        return data


class DiabetesScreeningResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    screening_date: date
    method: str
    total_score: int
    risk_level: str
    risk_probability_text: str
    input_data: Dict[str, Any]
    clinical_guidance: str


@router.post("/calculate", response_model=Dict[str, Any])
def preview_diabetes_risk(payload: DiabetesScreeningRequest):
    """Calculate FINDRISC score and return educational risk breakdown without saving to database."""
    return diabetes_service.calculate_findrisc_score(
        age=payload.age,
        bmi=payload.bmi,
        gender=payload.gender,
        waist_circumference_cm=payload.waist_circumference_cm,
        physical_activity_daily_30m=payload.physical_activity_daily_30m,
        daily_fruits_vegetables=payload.daily_fruits_vegetables,
        hypertension_meds=payload.hypertension_meds,
        history_high_blood_glucose=payload.history_high_blood_glucose,
        family_history_diabetes=payload.family_history_diabetes,
        fasting_glucose_mg_dl=payload.fasting_glucose_mg_dl,
        hba1c_percent=payload.hba1c_percent,
    )


@router.post("/screen", response_model=DiabetesScreeningResponse, status_code=status.HTTP_201_CREATED)
def submit_diabetes_screening(
    payload: DiabetesScreeningRequest,
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Submit a validated diabetes risk screening and persist results for active profile."""
    if not scope.can_write:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Write permission required to record health screenings",
        )

    screening = diabetes_service.record_diabetes_screening(
        db=db,
        user_id=scope.owner_id,
        screening_data=payload.model_dump(),
        care_profile_id=scope.profile_id,
        screening_date=payload.screening_date or date.today(),
    )
    return screening


@router.get("/history", response_model=List[DiabetesScreeningResponse])
def get_diabetes_screening_history(
    limit: int = Query(20, ge=1, le=100),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Retrieve historical diabetes risk assessments for the active profile."""
    return diabetes_service.get_diabetes_screenings(
        db=db,
        user_id=scope.owner_id,
        care_profile_id=scope.profile_id,
        limit=limit,
    )
