"""Service layer for emergency card, symptom diary, and doctor appointments."""

import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.middleware.profile_scope import ProfileScope
from app.models.emergency_and_symptoms import AppointmentStatus, DoctorAppointment, EmergencyCard, SymptomLog
from app.models.user import User
from app.schemas.emergency_and_symptoms import (
    AppointmentCreate,
    AppointmentUpdate,
    EmergencyCardUpdate,
    SymptomLogCreate,
)


def _get_scope_ids(db: Session, target: int | User | ProfileScope | None = None, user_id: Optional[int] = None) -> tuple[int, int]:
    t = target if target is not None else user_id
    if isinstance(t, ProfileScope):
        return t.owner_id, t.profile_id
    from app.services.care_profile_service import get_or_create_primary_profile
    user = db.get(User, t) if isinstance(t, int) else t
    primary = get_or_create_primary_profile(db, user)
    return user.id, primary.id


# ──────────────────────────────────────────────
# Emergency Card
# ──────────────────────────────────────────────

def get_or_create_card(db: Session, target: int | User | ProfileScope | None = None, user_id: Optional[int] = None) -> EmergencyCard:
    """Return the profile's emergency card, creating one on first access."""
    owner_id, profile_id = _get_scope_ids(db, target, user_id)
    card = db.query(EmergencyCard).filter(EmergencyCard.care_profile_id == profile_id).first()
    if not card:
        card = EmergencyCard(
            user_id=owner_id,
            care_profile_id=profile_id,
            public_token=secrets.token_urlsafe(32),
            organ_donor=False,
            is_public=False,
        )
        db.add(card)
        db.commit()
        db.refresh(card)
    return card


def update_card(db: Session, target: int | User | ProfileScope | None = None, data: EmergencyCardUpdate = None, user_id: Optional[int] = None) -> EmergencyCard:
    """Update emergency card fields (upsert)."""
    from fastapi import HTTPException

    card = get_or_create_card(db, target, user_id=user_id)
    fields = data.model_dump(exclude_none=True)
    for field, value in fields.items():
        if field == "is_public":
            if value is False and card.is_public:
                card.is_public = False
                card.public_token = secrets.token_urlsafe(32)
                card.expires_at = None
            elif value is True:
                if not getattr(data, "consent_acknowledged", False):
                    raise HTTPException(400, "Consent acknowledgment is required to make the emergency card public.")
                card.is_public = True
                card.expires_at = datetime.now(timezone.utc) + timedelta(days=30)
            continue
        if field == "consent_acknowledged":
            continue
        setattr(card, field, value)
    card.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(card)
    return card


def _is_expired(dt: Optional[datetime]) -> bool:
    if not dt:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt < datetime.now(timezone.utc)


def get_public_card(db: Session, token: str) -> Optional[EmergencyCard]:
    """Return a card by its public token (no authentication required) if public and unexpired."""
    card = (
        db.query(EmergencyCard)
        .filter(EmergencyCard.public_token == token, EmergencyCard.is_public.is_(True))
        .first()
    )
    if not card:
        return None
    if card.expires_at and _is_expired(card.expires_at):
        card.is_public = False
        card.public_token = secrets.token_urlsafe(32)
        card.expires_at = None
        db.commit()
        return None
    return card


def regenerate_card_token(db: Session, target: int | User | ProfileScope | None = None, user_id: Optional[int] = None) -> EmergencyCard:
    """Regenerate public access token for the emergency card, invalidating previous link."""
    card = get_or_create_card(db, target, user_id=user_id)
    card.public_token = secrets.token_urlsafe(32)
    if card.is_public:
        card.expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    card.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(card)
    return card


def set_card_visibility(db: Session, target: int | User | ProfileScope | None = None, is_public: bool = True, user_id: Optional[int] = None, expiry_days: int = 30, consent_acknowledged: bool = False) -> EmergencyCard:
    """Toggle public sharing status for the emergency card with token rotation on revoke and expiry."""
    from fastapi import HTTPException

    card = get_or_create_card(db, target, user_id=user_id)
    if is_public:
        if not consent_acknowledged:
            raise HTTPException(400, "Consent acknowledgment is required to make the emergency card public.")
        card.is_public = True
        card.expires_at = datetime.now(timezone.utc) + timedelta(days=min(expiry_days or 30, 30))
    else:
        # Stopping sharing permanently invalidates the previous link
        card.is_public = False
        card.public_token = secrets.token_urlsafe(32)
        card.expires_at = None
    card.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(card)
    return card


# ──────────────────────────────────────────────
# Symptom Log
# ──────────────────────────────────────────────

def log_symptom(db: Session, target: int | User | ProfileScope | None = None, data: SymptomLogCreate = None, user_id: Optional[int] = None) -> SymptomLog:
    """Record a new symptom entry for the target profile."""
    owner_id, profile_id = _get_scope_ids(db, target, user_id)
    entry = SymptomLog(
        user_id=owner_id,
        care_profile_id=profile_id,
        symptom_name=data.symptom_name,
        severity=data.severity,
        notes=data.notes,
        logged_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_symptoms(db: Session, target: int | User | ProfileScope | None = None, days: int = 30, user_id: Optional[int] = None) -> List[SymptomLog]:
    """Return symptom logs for the last N days, newest first."""
    from datetime import timedelta
    owner_id, profile_id = _get_scope_ids(db, target, user_id)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    return (
        db.query(SymptomLog)
        .filter(SymptomLog.care_profile_id == profile_id, SymptomLog.logged_at >= cutoff)
        .order_by(SymptomLog.logged_at.desc(), SymptomLog.id.desc())
        .all()
    )


def delete_symptom(db: Session, target: int | User | ProfileScope | None = None, symptom_id: int = 0, user_id: Optional[int] = None) -> bool:
    """Delete a symptom log entry."""
    owner_id, profile_id = _get_scope_ids(db, target, user_id)
    entry = (
        db.query(SymptomLog)
        .filter(SymptomLog.id == symptom_id, SymptomLog.care_profile_id == profile_id)
        .first()
    )
    if not entry:
        return False
    db.delete(entry)
    db.commit()
    return True



# ──────────────────────────────────────────────
# Doctor Appointments
# ──────────────────────────────────────────────

def create_appointment(db: Session, target: int | User | ProfileScope | None = None, data: AppointmentCreate = None, user_id: Optional[int] = None) -> DoctorAppointment:
    """Create a new appointment record for the target profile."""
    owner_id, profile_id = _get_scope_ids(db, target, user_id)
    appt = DoctorAppointment(
        user_id=owner_id,
        care_profile_id=profile_id,
        doctor_name=data.doctor_name,
        specialty=data.specialty,
        location=data.location,
        appointment_date=data.appointment_date,
        reason_for_visit=data.reason_for_visit,
        questions_to_ask=data.questions_to_ask,
        doctor_notes=data.doctor_notes,
        followup_date=data.followup_date,
        status=AppointmentStatus.UPCOMING,
    )
    db.add(appt)
    db.commit()
    db.refresh(appt)
    return appt


def list_appointments(db: Session, target: int | User | ProfileScope | None = None, user_id: Optional[int] = None) -> List[DoctorAppointment]:
    """Return all appointments for target profile, upcoming first, then recent completed."""
    owner_id, profile_id = _get_scope_ids(db, target, user_id)
    return (
        db.query(DoctorAppointment)
        .filter(DoctorAppointment.care_profile_id == profile_id)
        .order_by(DoctorAppointment.appointment_date.asc())
        .all()
    )


def get_appointment(db: Session, target: int | User | ProfileScope | None = None, appt_id: int = 0, user_id: Optional[int] = None) -> Optional[DoctorAppointment]:
    owner_id, profile_id = _get_scope_ids(db, target, user_id)
    return (
        db.query(DoctorAppointment)
        .filter(DoctorAppointment.id == appt_id, DoctorAppointment.care_profile_id == profile_id)
        .first()
    )


def update_appointment(
    db: Session,
    target: int | User | ProfileScope | None = None,
    appt_id: int = 0,
    data: Optional[AppointmentUpdate] = None,
    user_id: Optional[int] = None,
) -> Optional[DoctorAppointment]:
    """Update appointment details / status."""
    appt = get_appointment(db, target, appt_id, user_id=user_id)
    if not appt:
        return None
    if data:
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(appt, field, value)
    db.commit()
    db.refresh(appt)
    return appt


def delete_appointment(
    db: Session,
    target: int | User | ProfileScope | None = None,
    appt_id: int = 0,
    user_id: Optional[int] = None,
) -> bool:
    """Delete an appointment, returns True if deleted."""
    appt = get_appointment(db, target, appt_id, user_id=user_id)
    if not appt:
        return False
    db.delete(appt)
    db.commit()
    return True


# ──────────────────────────────────────────────
# Symptom Analytics (Group 8: E2)
# ──────────────────────────────────────────────

def get_symptom_analytics(
    db: Session,
    target: int | User | ProfileScope | None = None,
    days: int = 30,
    user_id: Optional[int] = None,
) -> dict:
    """Analyze symptom frequency, intensity trends, and distribution over N days."""
    from datetime import timedelta
    owner_id, profile_id = _get_scope_ids(db, target, user_id)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    midpoint = now - timedelta(days=days // 2)

    rows = (
        db.query(SymptomLog)
        .filter(
            SymptomLog.user_id == owner_id,
            (SymptomLog.care_profile_id == profile_id) | (SymptomLog.care_profile_id.is_(None)),
            SymptomLog.logged_at >= cutoff,
        )
        .order_by(SymptomLog.logged_at.desc())
        .all()
    )

    if not rows:
        return {
            "days_analyzed": days,
            "total_logs": 0,
            "unique_symptoms": 0,
            "overall_average_severity": 0.0,
            "symptom_breakdown": [],
            "timeline": [],
        }

    # Group by symptom name
    breakdown_map = {}
    timeline_map = {}

    first_half_counts = {}
    second_half_counts = {}

    for log in rows:
        name = log.symptom_name.strip()
        sev = log.severity or 1
        log_date_str = log.logged_at.strftime("%Y-%m-%d")

        if name not in breakdown_map:
            breakdown_map[name] = {"count": 0, "severities": []}
        breakdown_map[name]["count"] += 1
        breakdown_map[name]["severities"].append(sev)

        # Timeline
        if log_date_str not in timeline_map:
            timeline_map[log_date_str] = {"date": log_date_str, "count": 0, "max_severity": 0}
        timeline_map[log_date_str]["count"] += 1
        if sev > timeline_map[log_date_str]["max_severity"]:
            timeline_map[log_date_str]["max_severity"] = sev

        # Trend (first half vs second half)
        log_dt = log.logged_at if log.logged_at.tzinfo else log.logged_at.replace(tzinfo=timezone.utc)
        if log_dt >= midpoint:
            second_half_counts[name] = second_half_counts.get(name, 0) + 1
        else:
            first_half_counts[name] = first_half_counts.get(name, 0) + 1

    symptom_breakdown = []
    total_sev_sum = 0
    total_sev_count = 0

    for name, data in breakdown_map.items():
        count = data["count"]
        sevs = data["severities"]
        avg_sev = round(sum(sevs) / len(sevs), 1)
        max_sev = max(sevs)
        total_sev_sum += sum(sevs)
        total_sev_count += len(sevs)

        # Determine trend
        h1 = first_half_counts.get(name, 0)
        h2 = second_half_counts.get(name, 0)
        if h2 > h1:
            trend = "INCREASING"
        elif h2 < h1:
            trend = "DECREASING"
        else:
            trend = "STABLE"

        symptom_breakdown.append({
            "symptom_name": name,
            "frequency": count,
            "average_severity": avg_sev,
            "max_severity": max_sev,
            "trend": trend,
        })

    symptom_breakdown.sort(key=lambda x: x["frequency"], reverse=True)
    timeline = sorted(timeline_map.values(), key=lambda x: x["date"])

    overall_avg = round(total_sev_sum / total_sev_count, 1) if total_sev_count else 0.0

    return {
        "days_analyzed": days,
        "total_logs": len(rows),
        "unique_symptoms": len(symptom_breakdown),
        "overall_average_severity": overall_avg,
        "symptom_breakdown": symptom_breakdown,
        "timeline": timeline,
    }


# ──────────────────────────────────────────────
# Doctor Appointment Preparation (Group 8: E3)
# ──────────────────────────────────────────────

def get_appointment_prep(
    db: Session,
    target: int | User | ProfileScope | None = None,
    appt_id: int = 0,
    user_id: Optional[int] = None,
) -> dict:
    """Generate comprehensive pre-visit preparation summary for a doctor appointment."""
    from datetime import timedelta
    from app.models.health import HealthAssessment
    from app.models.medicine import Medicine

    owner_id, profile_id = _get_scope_ids(db, target, user_id)
    appt = get_appointment(db, target, appt_id, user_id=user_id)
    if not appt:
        return None

    # 1. Active medications
    meds = (
        db.query(Medicine)
        .filter(
            Medicine.user_id == owner_id,
            (Medicine.care_profile_id == profile_id) | (Medicine.care_profile_id.is_(None)),
            Medicine.is_active.is_(True),
        )
        .all()
    )
    active_meds = [
        {
            "id": m.id,
            "medicine_name": m.medicine_name,
            "dosage": f"{m.dosage} {m.dosage_unit}" if m.dosage else None,
            "form": m.form,
            "instructions": m.instructions,
            "reason_for_use": m.reason_for_use,
        }
        for m in meds
    ]

    # 2. Symptoms logged in the last 14 days
    fourteen_days_ago = datetime.now(timezone.utc) - timedelta(days=14)
    symptoms = (
        db.query(SymptomLog)
        .filter(
            SymptomLog.user_id == owner_id,
            (SymptomLog.care_profile_id == profile_id) | (SymptomLog.care_profile_id.is_(None)),
            SymptomLog.logged_at >= fourteen_days_ago,
        )
        .order_by(SymptomLog.logged_at.desc())
        .limit(10)
        .all()
    )
    recent_symptoms = [
        {
            "id": s.id,
            "symptom_name": s.symptom_name,
            "severity": s.severity,
            "logged_at": s.logged_at,
            "notes": s.notes,
        }
        for s in symptoms
    ]

    # 3. Latest Health Assessment
    assessment = (
        db.query(HealthAssessment)
        .filter(
            HealthAssessment.user_id == owner_id,
            (HealthAssessment.care_profile_id == profile_id) | (HealthAssessment.care_profile_id.is_(None)),
        )
        .order_by(HealthAssessment.assessment_date.desc(), HealthAssessment.id.desc())
        .first()
    )
    assessment_data = None
    if assessment:
        assessment_data = {
            "health_score": float(assessment.health_score) if assessment.health_score is not None else None,
            "risk_category": assessment.risk_category,
            "assessment_date": assessment.assessment_date,
        }

    return {
        "appointment": {
            "id": appt.id,
            "doctor_name": appt.doctor_name,
            "specialty": appt.specialty,
            "location": appt.location,
            "appointment_date": appt.appointment_date,
            "reason_for_visit": appt.reason_for_visit,
            "questions_to_ask": appt.questions_to_ask or [],
            "doctor_notes": appt.doctor_notes,
            "followup_date": appt.followup_date,
            "status": appt.status.value if hasattr(appt.status, "value") else str(appt.status),
        },
        "active_medications": active_meds,
        "recent_symptoms": recent_symptoms,
        "latest_assessment": assessment_data,
    }


