"""Health assessment business logic: run the score, persist it, keep the daily trend in sync."""

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.middleware.profile_scope import ProfileScope
from app.models import HealthAssessment, HealthHistory, User
from app.schemas.health import AssessmentCreate, MLPredictionOut, ScoreBreakdownOut
from app.services import prediction_service
from app.utils.health_score import AssessmentInput, breakdown_to_jsonable, compute_health_score

GLUCOSE_CAVEAT = ("Glucose reference ranges assume a fasting reading. If this was taken after "
                  "eating, treat the metabolic component as approximate.")

NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, "Assessment not found")


def _get_scope_ids(db: Session, target: User | ProfileScope) -> tuple[int, int, bool]:
    if isinstance(target, ProfileScope):
        return target.owner_id, target.profile_id, target.profile.is_primary
    from app.services.care_profile_service import get_or_create_primary_profile
    primary = get_or_create_primary_profile(db, target)
    return target.id, primary.id, primary.is_primary


def _profile_hints(user: User) -> list[str]:
    """Non-blocking nudges: assessment always proceeds, but missing profile fields make the
    score less complete. Only surfaced when something is actually missing."""
    p = user.profile
    hints = []
    if not p or p.height_cm is None or p.weight_kg is None:
        hints.append("Add your height and weight to your profile for a metabolic (BMI) score.")
    if not p or not p.exercise_frequency:
        hints.append("Set your exercise frequency in your profile to include an activity score.")
    if not p or p.sleep_duration_hours is None:
        hints.append("Set your average sleep duration in your profile to include a sleep score.")
    if not p or not p.smoking_status or not p.alcohol_consumption:
        hints.append("Complete your smoking and alcohol status in your profile to include a "
                     "substance-use score.")
    return hints


def create_assessment(db: Session, target: User | ProfileScope, data: AssessmentCreate) -> HealthAssessment:
    owner_id, profile_id, is_primary = _get_scope_ids(db, target)
    owner = db.get(User, owner_id)
    profile = owner.profile if (owner and is_primary) else None

    # Safety rule: For family members, do NOT borrow account owner's demographics/lifestyle.
    # Run vitals check only.
    if is_primary and profile:
        score_input = AssessmentInput(
            systolic_bp=data.systolic_bp, diastolic_bp=data.diastolic_bp, heart_rate_bpm=data.heart_rate_bpm,
            blood_glucose_mg_dl=data.blood_glucose_mg_dl, spo2_percent=data.spo2_percent,
            temperature_celsius=data.temperature_celsius,
            bmi=profile.bmi,
            exercise_frequency=profile.exercise_frequency,
            sleep_duration_hours=profile.sleep_duration_hours,
            smoking_status=profile.smoking_status,
            alcohol_consumption=profile.alcohol_consumption,
        )
    else:
        score_input = AssessmentInput(
            systolic_bp=data.systolic_bp, diastolic_bp=data.diastolic_bp, heart_rate_bpm=data.heart_rate_bpm,
            blood_glucose_mg_dl=data.blood_glucose_mg_dl, spo2_percent=data.spo2_percent,
            temperature_celsius=data.temperature_celsius,
        )

    result = compute_health_score(score_input)

    assessment = HealthAssessment(
        user_id=owner_id, care_profile_id=profile_id, assessment_date=date.today(),
        systolic_bp=data.systolic_bp, diastolic_bp=data.diastolic_bp, heart_rate_bpm=data.heart_rate_bpm,
        blood_glucose_mg_dl=data.blood_glucose_mg_dl, spo2_percent=data.spo2_percent,
        temperature_celsius=data.temperature_celsius, assessment_notes=data.assessment_notes,
        health_score=Decimal(str(result.overall_score)), risk_category=result.risk_category,
        score_breakdown=breakdown_to_jsonable(result),
        data_completeness_percent=Decimal(str(result.data_completeness_percent)),
        status="COMPLETED",
    )
    db.add(assessment)
    db.flush()  # get assessment.id / created_at before commit

    _upsert_history(db, owner_id, profile_id, assessment, profile)

    # Safety rule: AI cardiovascular prediction is only run for the primary user whose demographics exist
    if is_primary and owner:
        prediction_service.create_prediction_for_assessment(db, owner, assessment)

    db.commit()
    db.refresh(assessment)
    return assessment


def _upsert_history(db: Session, owner_id: int, profile_id: int, a: HealthAssessment, profile) -> None:
    """Same-day re-assessment overwrites that day's history row for this profile."""
    row = db.scalar(select(HealthHistory).where(
        HealthHistory.care_profile_id == profile_id, HealthHistory.tracking_date == a.assessment_date))
    if row is None:
        row = HealthHistory(user_id=owner_id, care_profile_id=profile_id, tracking_date=a.assessment_date)
        db.add(row)
    row.health_score = a.health_score
    row.weight_kg = profile.weight_kg if profile else None
    row.bmi = profile.bmi if profile else None
    row.systolic_bp = a.systolic_bp
    row.diastolic_bp = a.diastolic_bp
    row.heart_rate_bpm = a.heart_rate_bpm
    row.blood_glucose_mg_dl = a.blood_glucose_mg_dl
    row.spo2_percent = a.spo2_percent
    row.risk_category = a.risk_category


def get_assessment(db: Session, target: User | ProfileScope, assessment_id: int) -> HealthAssessment:
    owner_id, profile_id, is_primary = _get_scope_ids(db, target)
    p_filter = or_(HealthAssessment.care_profile_id == profile_id, HealthAssessment.care_profile_id.is_(None)) if is_primary else (HealthAssessment.care_profile_id == profile_id)
    a = db.scalar(select(HealthAssessment).where(
        HealthAssessment.id == assessment_id,
        HealthAssessment.user_id == owner_id,
        p_filter,
    ))
    if a is None:
        raise NOT_FOUND  # also covers "belongs to someone else" - never reveal which
    return a


def get_latest_assessment(db: Session, target: User | ProfileScope) -> Optional[HealthAssessment]:
    owner_id, profile_id, is_primary = _get_scope_ids(db, target)
    p_filter = or_(HealthAssessment.care_profile_id == profile_id, HealthAssessment.care_profile_id.is_(None)) if is_primary else (HealthAssessment.care_profile_id == profile_id)
    return db.scalar(
        select(HealthAssessment)
        .where(HealthAssessment.user_id == owner_id, p_filter)
        .order_by(HealthAssessment.created_at.desc(), HealthAssessment.id.desc())
        .limit(1)
    )


def list_assessments(db: Session, target: User | ProfileScope, page: int, page_size: int) -> tuple[list[HealthAssessment], int]:
    owner_id, profile_id, is_primary = _get_scope_ids(db, target)
    p_filter = or_(HealthAssessment.care_profile_id == profile_id, HealthAssessment.care_profile_id.is_(None)) if is_primary else (HealthAssessment.care_profile_id == profile_id)
    base = select(HealthAssessment).where(
        HealthAssessment.user_id == owner_id, p_filter
    )
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    rows = db.scalars(base.order_by(HealthAssessment.created_at.desc(), HealthAssessment.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return list(rows), total


def get_history(db: Session, target: User | ProfileScope, days: int) -> list[HealthHistory]:
    owner_id, profile_id, is_primary = _get_scope_ids(db, target)
    cutoff = date.today() - timedelta(days=days)
    p_filter = or_(HealthHistory.care_profile_id == profile_id, HealthHistory.care_profile_id.is_(None)) if is_primary else (HealthHistory.care_profile_id == profile_id)
    rows = db.scalars(select(HealthHistory).where(
        HealthHistory.user_id == owner_id,
        p_filter,
        HealthHistory.tracking_date >= cutoff
    ).order_by(HealthHistory.tracking_date.asc())).all()
    return list(rows)



def recalculate_assessment(db: Session, user: User, assessment_id: int) -> HealthAssessment:
    """Recalculates an assessment snapshot with the user's latest profile metrics."""
    assessment = get_assessment(db, user, assessment_id)
    profile = user.profile

    score_input = AssessmentInput(
        systolic_bp=assessment.systolic_bp, diastolic_bp=assessment.diastolic_bp,
        heart_rate_bpm=assessment.heart_rate_bpm, blood_glucose_mg_dl=assessment.blood_glucose_mg_dl,
        spo2_percent=assessment.spo2_percent, temperature_celsius=assessment.temperature_celsius,
        bmi=profile.bmi if profile else None,
        exercise_frequency=profile.exercise_frequency if profile else None,
        sleep_duration_hours=profile.sleep_duration_hours if profile else None,
        smoking_status=profile.smoking_status if profile else None,
        alcohol_consumption=profile.alcohol_consumption if profile else None,
    )
    result = compute_health_score(score_input)

    assessment.health_score = Decimal(str(result.overall_score))
    assessment.risk_category = result.risk_category
    assessment.score_breakdown = breakdown_to_jsonable(result)
    assessment.data_completeness_percent = Decimal(str(result.data_completeness_percent))

    if assessment.prediction is not None:
        db.delete(assessment.prediction)
        db.flush()

    prediction_service.create_prediction_for_assessment(db, user, assessment)
    _upsert_history(db, user, assessment, profile)
    db.commit()
    db.refresh(assessment)
    return assessment


def check_assessment_staleness(a: HealthAssessment, user: Any) -> tuple[bool, list[str]]:
    """Checks whether an existing assessment snapshot diverges from current profile attributes."""
    reasons: list[str] = []
    actual_user = getattr(user, "caller_user", user)
    profile = getattr(actual_user, "profile", None)
    if not profile or not hasattr(profile, "bmi"):
        return False, []

    # 1. Prediction was previously missing, but profile now has enough info
    if a.prediction is None:
        features, missing = prediction_service.build_features(actual_user, a)
        if features is not None and not missing:
            reasons.append("New profile information is available to calculate your cardiac risk prediction.")

    # 2. Profile vitals or habits were updated after the assessment was recorded
    if getattr(profile, "updated_at", None) and a.created_at:
        if profile.updated_at > (a.created_at + timedelta(seconds=5)):
            reasons.append("Profile metrics (weight, lifestyle habits, or vitals) were updated after this assessment.")

    # 3. Score discrepancy if current profile inputs produce a different health score
    bmi_val = getattr(profile, "bmi", None)
    if bmi_val is not None:
        score_input = AssessmentInput(
            systolic_bp=a.systolic_bp, diastolic_bp=a.diastolic_bp, heart_rate_bpm=a.heart_rate_bpm,
            blood_glucose_mg_dl=a.blood_glucose_mg_dl, spo2_percent=a.spo2_percent,
            temperature_celsius=a.temperature_celsius,
            bmi=bmi_val,
            exercise_frequency=getattr(profile, "exercise_frequency", None),
            sleep_duration_hours=getattr(profile, "sleep_duration_hours", None),
            smoking_status=getattr(profile, "smoking_status", None),
            alcohol_consumption=getattr(profile, "alcohol_consumption", None),
        )
        current_res = compute_health_score(score_input)
        if a.health_score is not None and int(a.health_score) != current_res.overall_score:
            if not any("Profile metrics" in r for r in reasons):
                reasons.append("Current health metrics produce a different overall score than this saved snapshot.")

    return len(reasons) > 0, reasons


def _ml_prediction_block(a: HealthAssessment, user: User, is_primary: bool = True) -> dict:
    if not is_primary:
        return {
            "ml_prediction": None,
            "ml_prediction_missing_fields": [],
            "ml_prediction_notice": "AI cardiovascular risk estimate is calibrated for the primary account holder only. Demographics are not shared across family profiles.",
        }
    if a.prediction is not None:
        p = a.prediction
        clinical_info = prediction_service.get_clinical_guidance(p.risk_level, a.systolic_bp)
        return {
            "ml_prediction": MLPredictionOut(
                probability=float(p.prediction_score), risk_level=p.risk_level,
                confidence_percent=float(p.confidence_percent), model_version=p.model_version,
                top_factors=p.prediction_factors, explanation_text=p.explanation_text,
                disclaimer=prediction_service.DISCLAIMER,
                clinical_context=clinical_info["screening_vs_diagnosis"],
                recommended_discussions=clinical_info["recommended_doctor_discussions"],
            ),
            "ml_prediction_missing_fields": [],
        }
    _, missing = prediction_service.build_features(user, a)
    return {"ml_prediction": None, "ml_prediction_missing_fields": missing}


def to_out_dict(a: HealthAssessment, user: Any, is_primary: bool | None = None) -> dict:
    """Assemble the API response: DB row + engine disclaimer/caveats + live profile hints + staleness."""
    from app.utils.health_score import DISCLAIMER
    actual_user = getattr(user, "caller_user", user)
    if is_primary is None:
        is_primary = a.care_profile.is_primary if a.care_profile else True

    breakdown = ScoreBreakdownOut.model_validate(a.score_breakdown) if a.score_breakdown else None
    is_stale, stale_reasons = check_assessment_staleness(a, actual_user) if is_primary else (False, [])
    clinical_info = prediction_service.get_clinical_guidance(a.risk_category, a.systolic_bp)
    return {
        "id": a.id, "assessment_date": a.assessment_date, "systolic_bp": a.systolic_bp,
        "diastolic_bp": a.diastolic_bp, "heart_rate_bpm": a.heart_rate_bpm,
        "blood_glucose_mg_dl": a.blood_glucose_mg_dl, "spo2_percent": a.spo2_percent,
        "temperature_celsius": a.temperature_celsius, "health_score": a.health_score,
        "risk_category": a.risk_category, "data_completeness_percent": a.data_completeness_percent,
        "assessment_notes": a.assessment_notes, "status": a.status, "created_at": a.created_at,
        "score_breakdown": breakdown, "disclaimer": DISCLAIMER,
        "glucose_caveat": GLUCOSE_CAVEAT if a.blood_glucose_mg_dl is not None else None,
        "profile_hints": _profile_hints(actual_user) if is_primary else [],
        "is_stale": is_stale,
        "stale_reasons": stale_reasons,
        "clinical_context": clinical_info["screening_vs_diagnosis"],
        "recommended_discussions": clinical_info["recommended_doctor_discussions"],
        **_ml_prediction_block(a, actual_user, is_primary=is_primary),
    }

