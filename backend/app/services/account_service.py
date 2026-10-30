"""Account management business logic for HealthPredict.

Covers:
- Account deletion (A1) with audit logging, confirmation email, cascade data wipe.
- Full multi-profile data export (A2) in structured JSON and ZIP of CSVs.
- Active session management & remote revocation (A4).
- Email & password management (A4).
- Two-factor authentication (TOTP RFC 6238) (A4).
"""

import csv
import io
import json
import logging
import zipfile
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import (
    AdminAuditLog, AppointmentStatus, CareProfile, CaregiverAccess, DoctorAppointment,
    DoctorShare, DoctorShareNote, EmergencyCard, ExerciseLog, GoalProgress,
    HealthAssessment, HealthHistory, HealthPrediction, HydrationLog,
    Medicine, MedicineIntakeLog, MedicineSchedule, Notification, NutritionLog,
    SleepLog, SymptomLog, TokenBlocklist, TokenType, User, UserDeviceToken,
    UserProfile, UserToken, WeeklyReport, WellnessGoal,
)
from app.schemas.auth import SessionOut
from app.utils import email as email_util
from app.utils.security import hash_password, hash_token, verify_password
from app.utils.timeutil import utcnow
from app.utils.totp import generate_totp_secret, get_totp_uri, verify_totp_code

logger = logging.getLogger(__name__)


def delete_account(db: Session, user: User, password: str) -> None:
    """Permanently delete user account and all owned health data."""
    if not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password",
        )

    user_id = user.id
    user_email = user.email
    user_name = user.full_name

    # 1. Write anonymous audit log (without personal data)
    logger.info(f"AUDIT: Account {user_id} deleted permanently at {utcnow().isoformat()}")

    # 2. Explicitly remove all user-owned records before deleting the user to ensure clean deletion
    from app.models.care_profile import CareProfile, CaregiverAccess
    from app.models.diabetes import DiabetesScreening
    from app.models.menstrual import MenstrualLog, PCOSScreening
    from app.models.fatty_liver import FattyLiverScreening
    from app.models.notification import Notification
    from app.models.user_device import UserDeviceToken
    from app.models.doctor_share import DoctorShare, DoctorShareNote
    from app.models.emergency_and_symptoms import EmergencyCard, SymptomLog, DoctorAppointment

    # Clean up caregiver access
    db.query(CaregiverAccess).filter(
        (CaregiverAccess.account_owner_id == user_id) | (CaregiverAccess.caregiver_user_id == user_id)
    ).delete(synchronize_session=False)

    # Clean up screening tables
    db.query(DiabetesScreening).filter(DiabetesScreening.user_id == user_id).delete(synchronize_session=False)
    db.query(MenstrualLog).filter(MenstrualLog.user_id == user_id).delete(synchronize_session=False)
    db.query(PCOSScreening).filter(PCOSScreening.user_id == user_id).delete(synchronize_session=False)
    db.query(FattyLiverScreening).filter(FattyLiverScreening.user_id == user_id).delete(synchronize_session=False)

    # Clean up notifications and devices
    db.query(Notification).filter(Notification.user_id == user_id).delete(synchronize_session=False)
    db.query(UserDeviceToken).filter(UserDeviceToken.user_id == user_id).delete(synchronize_session=False)

    # Clean up doctor shares and notes
    share_ids = [s[0] for s in db.query(DoctorShare.id).filter(DoctorShare.user_id == user_id).all()]
    if share_ids:
        db.query(DoctorShareNote).filter(DoctorShareNote.doctor_share_id.in_(share_ids)).delete(synchronize_session=False)
    db.query(DoctorShare).filter(DoctorShare.user_id == user_id).delete(synchronize_session=False)

    # Clean up emergency and appointments
    db.query(EmergencyCard).filter(EmergencyCard.user_id == user_id).delete(synchronize_session=False)
    db.query(SymptomLog).filter(SymptomLog.user_id == user_id).delete(synchronize_session=False)
    db.query(DoctorAppointment).filter(DoctorAppointment.user_id == user_id).delete(synchronize_session=False)

    # Clean up care profiles
    db.query(CareProfile).filter(CareProfile.account_owner_id == user_id).delete(synchronize_session=False)

    # 3. Remove any blocklisted tokens for this user
    db.query(TokenBlocklist).filter(TokenBlocklist.user_id == user_id).delete(synchronize_session=False)

    # 4. Delete the user (cascades to all owned tables via Foreign Keys)
    db.delete(user)
    db.commit()

    # 6. Send confirmation email AFTER successful commit (not before)
    try:
        email_util.send_account_deleted(to=user_email, full_name=user_name)
    except Exception as e:
        logger.warning(f"Could not send account deletion confirmation email: {e}")


def export_account_data(db: Session, user: User) -> Dict[str, Any]:
    """Export complete patient data across all profiles as a nested dictionary."""
    data: Dict[str, Any] = {
        "export_date": utcnow().isoformat(),
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "phone": user.phone,
            "date_of_birth": user.date_of_birth.isoformat() if user.date_of_birth else None,
            "gender": user.gender,
            "role": user.role,
            "timezone": getattr(user, "timezone", "UTC"),
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "profile": {},
        "care_profiles": [],
        "caregivers": [],
        "medicines": [],
        "health_assessments": [],
        "health_history": [],
        "exercise_logs": [],
        "sleep_logs": [],
        "hydration_logs": [],
        "nutrition_logs": [],
        "wellness_goals": [],
        "symptoms": [],
        "doctor_appointments": [],
        "emergency_card": None,
        "notifications": [],
        "doctor_shares": [],
        "weekly_reports": [],
        "diabetes_screenings": [],
        "menstrual_logs": [],
        "pcos_screenings": [],
        "fatty_liver_screenings": [],
        "health_predictions": [],
    }

    if user.profile:
        p = user.profile
        data["profile"] = {
            "height_cm": float(p.height_cm) if p.height_cm else None,
            "weight_kg": float(p.weight_kg) if p.weight_kg else None,
            "bmi": float(p.bmi) if p.bmi else None,
            "waist_circumference_cm": float(p.waist_circumference_cm) if p.waist_circumference_cm else None,
            "blood_type": p.blood_type,
            "allergies": p.allergies or [],
            "existing_conditions": p.existing_conditions or [],
            "family_history": p.family_history or [],
            "exercise_frequency": p.exercise_frequency,
            "sleep_duration_hours": float(p.sleep_duration_hours) if p.sleep_duration_hours else None,
            "smoking_status": p.smoking_status,
            "alcohol_consumption": p.alcohol_consumption,
            "cholesterol_level": p.cholesterol_level,
            "diet_type": p.diet_type,
            "water_intake_goal_ml": p.water_intake_goal_ml,
            "emergency_contact_name": p.emergency_contact_name,
            "emergency_contact_phone": p.emergency_contact_phone,
        }

    # Care Profiles
    care_profiles = db.scalars(select(CareProfile).where(CareProfile.account_owner_id == user.id)).all()
    for cp in care_profiles:
        data["care_profiles"].append({
            "id": cp.id,
            "full_name": cp.full_name,
            "relationship": cp.relationship,
            "date_of_birth": cp.date_of_birth.isoformat() if cp.date_of_birth else None,
            "gender": cp.gender,
            "is_primary": cp.is_primary,
            "created_at": cp.created_at.isoformat() if cp.created_at else None,
        })

    # Medicines & Intake Logs
    meds = db.scalars(select(Medicine).where(Medicine.user_id == user.id)).all()
    for m in meds:
        intake_logs = db.scalars(select(MedicineIntakeLog).where(MedicineIntakeLog.medicine_id == m.id)).all()
        data["medicines"].append({
            "id": m.id,
            "care_profile_id": m.care_profile_id,
            "name": getattr(m, "medicine_name", None) or getattr(m, "name", None),
            "dosage": float(m.dosage) if m.dosage else None,
            "dosage_unit": m.dosage_unit,
            "instructions": m.instructions,
            "is_active": getattr(m, "is_active", True),
            "quantity_on_hand": float(m.quantity_on_hand) if hasattr(m, "quantity_on_hand") and m.quantity_on_hand is not None else None,
            "intake_logs": [
                {
                    "scheduled_time": il.scheduled_time.isoformat() if il.scheduled_time else None,
                    "taken_at": il.taken_at.isoformat() if il.taken_at else None,
                    "status": il.status,
                }
                for il in intake_logs
            ],
        })

    # Health Assessments
    assessments = db.scalars(select(HealthAssessment).where(HealthAssessment.user_id == user.id)).all()
    for a in assessments:
        data["health_assessments"].append({
            "id": a.id,
            "care_profile_id": a.care_profile_id,
            "assessment_date": a.assessment_date.isoformat() if a.assessment_date else None,
            "systolic_bp": a.systolic_bp,
            "diastolic_bp": a.diastolic_bp,
            "heart_rate_bpm": a.heart_rate_bpm,
            "blood_glucose_mg_dl": a.blood_glucose_mg_dl,
            "spo2_percent": float(a.spo2_percent) if a.spo2_percent else None,
            "health_score": float(a.health_score) if a.health_score else None,
            "risk_category": a.risk_category,
        })

    # Health Predictions (ML models)
    assessment_ids = [a.id for a in assessments]
    if assessment_ids:
        preds = db.scalars(select(HealthPrediction).where(HealthPrediction.assessment_id.in_(assessment_ids))).all()
        for p in preds:
            data["health_predictions"].append({
                "id": p.id,
                "assessment_id": p.assessment_id,
                "prediction_score": float(p.prediction_score) if p.prediction_score is not None else None,
                "risk_level": p.risk_level,
                "confidence_percent": float(p.confidence_percent) if p.confidence_percent is not None else None,
                "model_version": p.model_version,
            })

    # Health History
    history = db.scalars(select(HealthHistory).where(HealthHistory.user_id == user.id)).all()
    for h in history:
        data["health_history"].append({
            "tracking_date": h.tracking_date.isoformat() if h.tracking_date else None,
            "care_profile_id": h.care_profile_id,
            "health_score": float(h.health_score) if h.health_score else None,
            "risk_category": h.risk_category,
        })

    # Exercise
    exercise = db.scalars(select(ExerciseLog).where(ExerciseLog.user_id == user.id)).all()
    for ex in exercise:
        data["exercise_logs"].append({
            "care_profile_id": ex.care_profile_id,
            "exercise_date": ex.exercise_date.isoformat() if ex.exercise_date else None,
            "exercise_type": ex.exercise_type,
            "duration_minutes": ex.duration_minutes,
            "calories_burned": ex.calories_burned,
        })

    # Sleep
    sleep = db.scalars(select(SleepLog).where(SleepLog.user_id == user.id)).all()
    for sl in sleep:
        data["sleep_logs"].append({
            "care_profile_id": sl.care_profile_id,
            "sleep_date": sl.sleep_date.isoformat() if sl.sleep_date else None,
            "duration_hours": float(sl.sleep_duration_hours) if sl.sleep_duration_hours else None,
            "quality": sl.sleep_quality,
        })

    # Hydration
    hydration = db.scalars(select(HydrationLog).where(HydrationLog.user_id == user.id)).all()
    for hy in hydration:
        data["hydration_logs"].append({
            "care_profile_id": hy.care_profile_id,
            "hydration_date": hy.hydration_date.isoformat() if hy.hydration_date else None,
            "water_intake_ml": hy.water_intake_ml,
        })

    # Nutrition
    nutrition = db.scalars(select(NutritionLog).where(NutritionLog.user_id == user.id)).all()
    for nu in nutrition:
        data["nutrition_logs"].append({
            "care_profile_id": nu.care_profile_id,
            "nutrition_date": nu.nutrition_date.isoformat() if nu.nutrition_date else None,
            "meal_type": nu.meal_type,
            "calories": nu.calories,
        })

    # Goals
    goals = db.scalars(select(WellnessGoal).where(WellnessGoal.user_id == user.id)).all()
    for g in goals:
        data["wellness_goals"].append({
            "care_profile_id": g.care_profile_id,
            "goal_type": g.goal_type,
            "target_value": float(g.target_value) if g.target_value else None,
            "current_value": float(g.baseline_value) if g.baseline_value else None,
            "unit": g.unit,
            "status": g.status,
        })

    # Symptoms
    symptoms = db.scalars(select(SymptomLog).where(SymptomLog.user_id == user.id)).all()
    for s in symptoms:
        data["symptoms"].append({
            "care_profile_id": s.care_profile_id,
            "symptom_name": s.symptom_name,
            "severity": s.severity,
            "logged_at": s.logged_at.isoformat() if s.logged_at else None,
            "notes": s.notes,
        })

    # Appointments
    appointments = db.scalars(select(DoctorAppointment).where(DoctorAppointment.user_id == user.id)).all()
    for appt in appointments:
        data["doctor_appointments"].append({
            "care_profile_id": appt.care_profile_id,
            "doctor_name": appt.doctor_name,
            "specialty": appt.specialty,
            "appointment_date": appt.appointment_date.isoformat() if appt.appointment_date else None,
            "status": appt.status,
            "reason_for_visit": appt.reason_for_visit,
        })

    # Caregivers
    caregivers = db.scalars(select(CaregiverAccess).where(CaregiverAccess.account_owner_id == user.id)).all()
    data["caregivers"] = [
        {
            "id": cg.id,
            "caregiver_email": cg.caregiver_email,
            "access_level": cg.access_level.value if hasattr(cg.access_level, "value") else str(cg.access_level),
            "status": cg.status.value if hasattr(cg.status, "value") else str(cg.status),
            "created_at": cg.created_at.isoformat() if cg.created_at else None,
            "accepted_at": cg.accepted_at.isoformat() if cg.accepted_at else None,
        }
        for cg in caregivers
    ]

    # Emergency Card
    card = db.scalar(select(EmergencyCard).where(EmergencyCard.user_id == user.id))
    if card:
        data["emergency_card"] = {
            "blood_type": card.blood_type,
            "allergies": card.allergies or [],
            "chronic_conditions": card.chronic_conditions or [],
            "current_medications": card.current_medications or [],
            "emergency_contact_name": card.emergency_contact_name,
            "emergency_contact_phone": card.emergency_contact_phone,
            "emergency_contact_relationship": card.emergency_contact_relationship,
            "organ_donor": card.organ_donor,
            "medical_notes": card.medical_notes,
            "is_public": card.is_public,
            "expires_at": card.expires_at.isoformat() if card.expires_at else None,
            "updated_at": card.updated_at.isoformat() if card.updated_at else None,
        }

    # Notifications
    notifications = db.scalars(select(Notification).where(Notification.user_id == user.id)).all()
    for n in notifications:
        data["notifications"].append({
            "title": n.title,
            "message": n.message,
            "type": n.notification_type,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        })

    # Doctor Shares
    shares = db.scalars(select(DoctorShare).where(DoctorShare.user_id == user.id)).all()
    for s in shares:
        notes = db.scalars(select(DoctorShareNote).where(DoctorShareNote.doctor_share_id == s.id)).all()
        data["doctor_shares"].append({
            "id": s.id,
            "care_profile_id": s.care_profile_id,
            "days_range": s.days_range,
            "questions_for_doctor": s.questions_for_doctor,
            "doctor_name": s.doctor_name,
            "expires_at": s.expires_at.isoformat() if s.expires_at else None,
            "is_revoked": s.is_revoked,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "notes": [
                {
                    "author_name": n.author_name,
                    "note_text": n.note_text,
                    "created_at": n.created_at.isoformat() if n.created_at else None,
                }
                for n in notes if not n.is_hidden
            ],
        })

    # Weekly Reports
    w_reports = db.scalars(select(WeeklyReport).where(WeeklyReport.user_id == user.id)).all()
    for wr in w_reports:
        data["weekly_reports"].append({
            "id": wr.id,
            "care_profile_id": wr.care_profile_id,
            "week_start_date": wr.week_start_date.isoformat() if wr.week_start_date else None,
            "week_end_date": wr.week_end_date.isoformat() if wr.week_end_date else None,
            "average_health_score": float(wr.average_health_score) if wr.average_health_score else None,
            "weight_change_kg": float(wr.weight_change_kg) if wr.weight_change_kg else None,
            "total_exercise_minutes": wr.total_exercise_minutes,
            "average_sleep_duration": float(wr.average_sleep_duration) if wr.average_sleep_duration else None,
            "average_hydration_ml": wr.average_hydration_ml,
            "medicine_adherence_percent": float(wr.medicine_adherence_percent) if wr.medicine_adherence_percent else None,
            "goals_progress_percent": float(wr.goals_progress_percent) if wr.goals_progress_percent else None,
            "created_at": wr.created_at.isoformat() if wr.created_at else None,
        })

    # Diabetes Screenings
    from app.models.diabetes import DiabetesScreening
    diabetes_rows = db.scalars(select(DiabetesScreening).where(DiabetesScreening.user_id == user.id)).all()
    data["diabetes_screenings"] = [
        {
            "id": r.id,
            "care_profile_id": r.care_profile_id,
            "screening_date": r.screening_date.isoformat() if r.screening_date else None,
            "method": r.method,
            "total_score": r.total_score,
            "risk_level": r.risk_level,
            "risk_probability_text": r.risk_probability_text,
            "input_data": r.input_data,
            "clinical_guidance": r.clinical_guidance,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in diabetes_rows
    ]

    # Menstrual Logs
    from app.models.menstrual import MenstrualLog
    menstrual_rows = db.scalars(select(MenstrualLog).where(MenstrualLog.user_id == user.id)).all()
    data["menstrual_logs"] = [
        {
            "id": r.id,
            "care_profile_id": r.care_profile_id,
            "period_start_date": r.period_start_date.isoformat() if r.period_start_date else None,
            "period_end_date": r.period_end_date.isoformat() if r.period_end_date else None,
            "cycle_length_days": r.cycle_length_days,
            "period_duration_days": r.period_duration_days,
            "flow_intensity": r.flow_intensity,
            "pain_level": r.pain_level,
            "symptoms": r.symptoms,
            "notes": r.notes,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in menstrual_rows
    ]

    # PCOS Screenings
    from app.models.menstrual import PCOSScreening
    pcos_rows = db.scalars(select(PCOSScreening).where(PCOSScreening.user_id == user.id)).all()
    data["pcos_screenings"] = [
        {
            "id": r.id,
            "care_profile_id": r.care_profile_id,
            "screening_date": r.screening_date.isoformat() if r.screening_date else None,
            "cycle_regularity": r.cycle_regularity,
            "excess_androgen_symptoms": r.excess_androgen_symptoms,
            "metabolic_indicators": r.metabolic_indicators,
            "ultrasound_findings": r.ultrasound_findings,
            "symptom_count": r.symptom_count,
            "risk_assessment_text": r.risk_assessment_text,
            "educational_guidance": r.educational_guidance,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in pcos_rows
    ]

    # Fatty Liver Screenings
    from app.models.fatty_liver import FattyLiverScreening
    fl_rows = db.scalars(select(FattyLiverScreening).where(FattyLiverScreening.user_id == user.id)).all()
    data["fatty_liver_screenings"] = [
        {
            "id": r.id,
            "care_profile_id": r.care_profile_id,
            "screening_date": r.screening_date.isoformat() if r.screening_date else None,
            "bmi": float(r.bmi) if r.bmi else None,
            "waist_circumference_cm": float(r.waist_circumference_cm) if r.waist_circumference_cm else None,
            "has_hypertension": r.has_hypertension,
            "has_type2_diabetes_or_prediabetes": r.has_type2_diabetes_or_prediabetes,
            "high_triglycerides": r.high_triglycerides,
            "low_hdl": r.low_hdl,
            "alcohol_units_weekly": float(r.alcohol_units_weekly) if r.alcohol_units_weekly else None,
            "alt_u_l": float(r.alt_u_l) if r.alt_u_l else None,
            "ast_u_l": float(r.ast_u_l) if r.ast_u_l else None,
            "prior_imaging_steatosis": r.prior_imaging_steatosis,
            "metabolic_factors_count": r.metabolic_factors_count,
            "risk_level": r.risk_level,
            "risk_summary": r.risk_summary,
            "educational_guidance": r.educational_guidance,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in fl_rows
    ]

    return data


def export_account_zip(db: Session, user: User) -> bytes:
    """Generate a ZIP file containing CSV tables for all user data."""
    raw = export_account_data(db, user)
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. Profile CSV
        p_buf = io.StringIO()
        p_writer = csv.writer(p_buf)
        p_writer.writerow(["Field", "Value"])
        for k, v in raw["user"].items():
            p_writer.writerow([f"user_{k}", v])
        for k, v in raw["profile"].items():
            p_writer.writerow([k, json.dumps(v) if isinstance(v, (list, dict)) else v])
        zf.writestr("profile.csv", p_buf.getvalue())

        # 2. Emergency Card CSV
        if raw.get("emergency_card"):
            ec_buf = io.StringIO()
            ec_writer = csv.writer(ec_buf)
            ec_writer.writerow(["Field", "Value"])
            for k, v in raw["emergency_card"].items():
                ec_writer.writerow([k, json.dumps(v) if isinstance(v, (list, dict)) else v])
            zf.writestr("emergency_card.csv", ec_buf.getvalue())
        else:
            zf.writestr("emergency_card.csv", "No emergency card on file\n")

        # 3. Helper to write tabular CSV
        def write_table(filename: str, rows: List[Dict[str, Any]]):
            if not rows:
                zf.writestr(filename, "No records found\n")
                return
            headers = list(rows[0].keys())
            buf = io.StringIO()
            writer = csv.DictWriter(buf, fieldnames=headers)
            writer.writeheader()
            for r in rows:
                clean_row = {}
                for k, v in r.items():
                    if isinstance(v, (list, dict)):
                        clean_row[k] = json.dumps(v)
                    else:
                        clean_row[k] = v
                writer.writerow(clean_row)
            zf.writestr(filename, buf.getvalue())

        write_table("care_profiles.csv", raw.get("care_profiles", []))
        write_table("caregivers.csv", raw.get("caregivers", []))
        write_table("medicines.csv", raw.get("medicines", []))
        write_table("health_assessments.csv", raw.get("health_assessments", []))
        write_table("health_history.csv", raw.get("health_history", []))
        write_table("exercise_logs.csv", raw.get("exercise_logs", []))
        write_table("sleep_logs.csv", raw.get("sleep_logs", []))
        write_table("hydration_logs.csv", raw.get("hydration_logs", []))
        write_table("nutrition_logs.csv", raw.get("nutrition_logs", []))
        write_table("wellness_goals.csv", raw.get("wellness_goals", []))
        write_table("symptoms.csv", raw.get("symptoms", []))
        write_table("doctor_appointments.csv", raw.get("doctor_appointments", []))
        write_table("doctor_shares.csv", raw.get("doctor_shares", []))
        write_table("weekly_reports.csv", raw.get("weekly_reports", []))
        write_table("notifications.csv", raw.get("notifications", []))
        write_table("diabetes_screenings.csv", raw.get("diabetes_screenings", []))
        write_table("menstrual_logs.csv", raw.get("menstrual_logs", []))
        write_table("pcos_screenings.csv", raw.get("pcos_screenings", []))
        write_table("fatty_liver_screenings.csv", raw.get("fatty_liver_screenings", []))
        write_table("health_predictions.csv", raw.get("health_predictions", []))

    return zip_buffer.getvalue()


def list_user_sessions(
    db: Session, user: User, current_token_raw: Optional[str] = None
) -> List[SessionOut]:
    """Return active login sessions for the user."""
    now = utcnow()
    tokens = db.scalars(
        select(UserToken)
        .where(
            UserToken.user_id == user.id,
            UserToken.token_type == TokenType.REFRESH,
            UserToken.revoked.is_(False),
            UserToken.expires_at > now,
        )
        .order_by(UserToken.created_at.desc())
    ).all()

    current_hash = hash_token(current_token_raw) if current_token_raw else None
    results = []
    for t in tokens:
        results.append(
            SessionOut(
                id=t.id,
                device_name=t.device_name or "Web Browser",
                ip_address=t.ip_address or "Unknown",
                user_agent=t.user_agent or "Unknown Client",
                created_at=t.created_at,
                expires_at=t.expires_at,
                is_current=(t.token_hash == current_hash),
            )
        )
    return results


def revoke_session(db: Session, user: User, session_id: int) -> bool:
    """Revoke a specific session."""
    token = db.scalar(
        select(UserToken).where(
            UserToken.id == session_id,
            UserToken.user_id == user.id,
            UserToken.token_type == TokenType.REFRESH,
        )
    )
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    token.revoked = True
    db.commit()
    return True


def revoke_all_sessions(db: Session, user: User, current_token_raw: Optional[str] = None) -> int:
    """Revoke all active sessions for the user (except current if provided)."""
    current_hash = hash_token(current_token_raw) if current_token_raw else None
    query = (
        update(UserToken)
        .where(
            UserToken.user_id == user.id,
            UserToken.token_type == TokenType.REFRESH,
            UserToken.revoked.is_(False),
        )
    )
    if current_hash:
        query = query.where(UserToken.token_hash != current_hash)
    result = db.execute(query.values(revoked=True))
    db.commit()
    return result.rowcount


def change_password(db: Session, user: User, current_password: str, new_password: str) -> None:
    """Change password and revoke all existing sessions."""
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password",
        )
    user.password_hash = hash_password(new_password)
    # Revoke all refresh tokens
    db.execute(
        update(UserToken)
        .where(UserToken.user_id == user.id, UserToken.token_type == TokenType.REFRESH)
        .values(revoked=True)
    )
    db.commit()


def change_email_request(db: Session, user: User, new_email: str, password: str) -> None:
    """Initiate an email change by verifying password and sending verification to new address."""
    if not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password",
        )
    new_email = new_email.lower().strip()
    if new_email == user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New email must be different from current email",
        )
    existing = db.scalar(select(User.id).where(User.email == new_email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # Store pending email change token with user_agent containing the new_email
    raw_token = email_util._generate_opaque_token() if hasattr(email_util, "_generate_opaque_token") else "tok_" + hash_password(new_email)[:32]
    from app.utils.security import generate_opaque_token
    raw_token = generate_opaque_token()
    tok = UserToken(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        token_type="EMAIL_CHANGE",
        expires_at=utcnow() + timedelta(hours=24),
        user_agent=new_email,  # Storing the new target email securely in metadata
    )
    db.add(tok)
    db.commit()

    email_util.send_email_change_verification(to=new_email, full_name=user.full_name, token=raw_token)


def confirm_email_change(db: Session, raw_token: str) -> str:
    """Confirm new email address and update user account."""
    tok = db.scalar(
        select(UserToken).where(
            UserToken.token_hash == hash_token(raw_token),
            UserToken.token_type == "EMAIL_CHANGE",
            UserToken.revoked.is_(False),
            UserToken.expires_at > utcnow(),
        )
    )
    if not tok or not tok.user_agent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired email change token",
        )
    new_email = tok.user_agent
    user = db.get(User, tok.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.email = new_email
    user.email_verified = True
    tok.revoked = True
    tok.used_at = utcnow()
    db.commit()
    return new_email


def setup_totp(user: User) -> tuple[str, str]:
    """Generate a new TOTP secret and QR/URI."""
    secret = generate_totp_secret()
    uri = get_totp_uri(secret, user.email)
    return secret, uri


def enable_totp(db: Session, user: User, secret: str, code: str) -> bool:
    """Verify code and enable TOTP on user account."""
    if not verify_totp_code(secret, code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code. Please check your authenticator app and try again.",
        )
    user.totp_secret = secret
    user.totp_enabled = True
    db.commit()
    return True


def disable_totp(db: Session, user: User, password: str, code: str) -> bool:
    """Disable TOTP after verifying password and code."""
    if not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password",
        )
    if user.totp_secret and not verify_totp_code(user.totp_secret, code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code",
        )
    user.totp_secret = None
    user.totp_enabled = False
    db.execute(
        update(User)
        .where(User.id == user.id)
        .values(totp_secret=None, totp_enabled=False)
    )
    db.commit()
    db.refresh(user)
    return True
