"""Voice-Assisted Health Entry API Routes.

Parses transcribed speech into structured health measurement fields and handles
confirmed saves into the respective health tracking tables with profile scoping.
"""

from datetime import date
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.middleware.profile_scope import ProfileScope, require_write_scope
from app.models.health import HealthAssessment
from app.models.tracking import ExerciseLog, HydrationLog, SleepLog
from app.models.user import UserProfile
from app.services import voice_parser_service

router = APIRouter(prefix="/health/voice", tags=["Voice Entry"])


class VoiceParseRequest(BaseModel):
    transcript: str = Field(..., min_length=1, max_length=500, description="Transcribed voice text")


class VoiceSaveRequest(BaseModel):
    metric_type: str = Field(..., description="WEIGHT | BLOOD_PRESSURE | SLEEP | HYDRATION | EXERCISE")
    fields: Dict[str, Any] = Field(..., description="Confirmed structured fields")
    target_date: Optional[date] = Field(default_factory=date.today)


@router.post("/parse")
def parse_voice_utterance(payload: VoiceParseRequest):
    """Parses spoken audio transcript into structured health fields without saving."""
    return voice_parser_service.parse_voice_health_entry(payload.transcript)


@router.post("/confirm-save")
def confirm_save_voice_entry(
    payload: VoiceSaveRequest,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    """Saves confirmed structured health data parsed from voice into the active profile."""
    owner_id = scope.owner_id
    profile_id = scope.profile_id
    is_primary = getattr(scope.profile, "is_primary", True)
    f = payload.fields
    t_date = payload.target_date or date.today()

    # ── Physiological range validation ──────────────────────────────
    def _to_float(v, label):
        if v is None:
            return None
        try:
            return float(v)
        except (ValueError, TypeError):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"{label} must be a valid number. Received: {v}",
            )

    def _validate_range(value, lo, hi, label, unit=""):
        num = _to_float(value, label)
        if num is not None and (num < lo or num > hi):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"{label} must be between {lo} and {hi}{(' ' + unit) if unit else ''}. Received: {value}",
            )
        return num

    if payload.metric_type == "WEIGHT":
        _validate_range(f.get("weight_kg"), 20, 400, "Weight", "kg")
    elif payload.metric_type == "BLOOD_PRESSURE":
        sys_v = _validate_range(f.get("systolic_bp"), 60, 260, "Systolic BP", "mmHg")
        dia_v = _validate_range(f.get("diastolic_bp"), 30, 200, "Diastolic BP", "mmHg")
        if sys_v is not None and dia_v is not None and sys_v <= dia_v:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Systolic BP ({sys_v}) must be strictly greater than diastolic BP ({dia_v}).",
            )
    elif payload.metric_type == "SLEEP":
        _validate_range(f.get("sleep_duration_hours"), 0.5, 24, "Sleep duration", "hours")
    elif payload.metric_type == "HYDRATION":
        _validate_range(f.get("water_intake_ml"), 50, 10000, "Water intake", "ml")
    elif payload.metric_type == "EXERCISE":
        _validate_range(f.get("duration_minutes"), 1, 1440, "Exercise duration", "minutes")

    if payload.metric_type == "WEIGHT":
        weight_kg = f.get("weight_kg")
        if not weight_kg:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "weight_kg required")
        if is_primary:
            user_prof = db.query(UserProfile).filter(UserProfile.user_id == owner_id).first()
            if user_prof:
                user_prof.weight_kg = weight_kg
        # Also record in CareProfile if not primary
        if not is_primary and scope.profile:
            scope.profile.weight_kg = weight_kg
        db.commit()
        return {"status": "saved", "metric_type": "WEIGHT", "message": f"Weight {weight_kg} kg recorded successfully."}

    elif payload.metric_type == "BLOOD_PRESSURE":
        sys_bp = f.get("systolic_bp")
        dia_bp = f.get("diastolic_bp")
        if not sys_bp or not dia_bp:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "systolic_bp and diastolic_bp required")
        # Save assessment with vitals
        ha = HealthAssessment(
            user_id=owner_id,
            care_profile_id=profile_id if not is_primary else None,
            assessment_date=t_date,
            systolic_bp=sys_bp,
            diastolic_bp=dia_bp,
            assessment_notes="Voice-assisted vitals entry",
        )
        db.add(ha)
        db.commit()
        return {"status": "saved", "metric_type": "BLOOD_PRESSURE", "message": f"Blood Pressure {sys_bp}/{dia_bp} mmHg recorded."}

    elif payload.metric_type == "SLEEP":
        hrs = f.get("sleep_duration_hours")
        if not hrs:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "sleep_duration_hours required")
        sl = SleepLog(
            user_id=owner_id,
            care_profile_id=profile_id if not is_primary else None,
            sleep_date=t_date,
            sleep_duration_hours=hrs,
            sleep_quality=4,
            source="voice",
        )
        db.add(sl)
        db.commit()
        return {"status": "saved", "metric_type": "SLEEP", "message": f"Sleep {hrs} hours recorded."}

    elif payload.metric_type == "HYDRATION":
        ml = f.get("water_intake_ml")
        if not ml:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "water_intake_ml required")
        hy = HydrationLog(
            user_id=owner_id,
            care_profile_id=profile_id if not is_primary else None,
            hydration_date=t_date,
            water_intake_ml=ml,
            notes="Voice-assisted entry",
        )
        db.add(hy)
        db.commit()
        return {"status": "saved", "metric_type": "HYDRATION", "message": f"Hydration {ml} ml recorded."}

    elif payload.metric_type == "EXERCISE":
        mins = f.get("duration_minutes")
        ex_type = f.get("exercise_type", "Walking")
        if not mins:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "duration_minutes required")
        ex = ExerciseLog(
            user_id=owner_id,
            care_profile_id=profile_id if not is_primary else None,
            exercise_date=t_date,
            exercise_type=ex_type,
            duration_minutes=mins,
            intensity=f.get("intensity", "MODERATE"),
            source="voice",
        )
        db.add(ex)
        db.commit()
        return {"status": "saved", "metric_type": "EXERCISE", "message": f"Exercise {mins} min of {ex_type} recorded."}

    raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown metric type {payload.metric_type}")
