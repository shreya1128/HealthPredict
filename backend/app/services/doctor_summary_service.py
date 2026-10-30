import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.middleware.profile_scope import ProfileScope
from app.models.care_profile import CareProfile
from app.models.doctor_share import DoctorShare, DoctorShareNote
from app.models.health import HealthAssessment
from app.models.medicine import Medicine, MedicineSchedule
from app.models.user import User
from app.services import medicine_service


def _get_scope_ids(db: Session, target: User | ProfileScope | None = None, user: Optional[User] = None) -> tuple[int, int]:
    actual_target = target or user
    if isinstance(actual_target, ProfileScope):
        return actual_target.owner_id, actual_target.profile_id
    from app.services.care_profile_service import get_or_create_primary_profile
    primary = get_or_create_primary_profile(db, actual_target)
    return actual_target.id, primary.id


def create_share_link(
    db: Session,
    target: User | ProfileScope | None = None,
    days_range: int = 30,
    questions: Optional[List[str]] = None,
    expire_days: int = 7,
    user: Optional[User] = None,
) -> DoctorShare:
    owner_id, profile_id = _get_scope_ids(db, target, user=user)
    token = secrets.token_urlsafe(32)
    share = DoctorShare(
        user_id=owner_id,
        care_profile_id=profile_id,
        token=token,
        days_range=days_range,
        questions_for_doctor=questions or [],
        expires_at=datetime.now(timezone.utc) + timedelta(days=expire_days),
        is_revoked=False,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return share


def list_shares(db: Session, target: User | ProfileScope) -> List[DoctorShare]:
    owner_id, profile_id = _get_scope_ids(db, target)
    return list(
        db.scalars(
            select(DoctorShare)
            .where(
                DoctorShare.user_id == owner_id,
                DoctorShare.care_profile_id == profile_id,
            )
            .order_by(DoctorShare.created_at.desc())
        ).all()
    )


def revoke_share(db: Session, target: User | ProfileScope, share_id: int) -> None:
    owner_id, profile_id = _get_scope_ids(db, target)
    share = db.scalar(
        select(DoctorShare).where(
            DoctorShare.id == share_id,
            DoctorShare.user_id == owner_id,
            DoctorShare.care_profile_id == profile_id,
        )
    )
    if not share:
        raise HTTPException(404, "Share not found")
    share.is_revoked = True
    db.commit()


def get_public_doctor_summary(db: Session, token: str) -> Dict[str, Any]:
    share = db.scalar(select(DoctorShare).where(DoctorShare.token == token))
    if not share or not share.is_valid():
        raise HTTPException(404, "This doctor summary link is invalid, expired, or has been revoked.")

    user = share.user
    cutoff = date.today() - timedelta(days=share.days_range)
    owner_id = share.user_id
    profile_id = share.care_profile_id

    # Patient name: profile name if available, else user name
    patient_name = share.care_profile.full_name if share.care_profile else user.full_name

    # Vitals history
    stmt_v = select(HealthAssessment).where(
        HealthAssessment.user_id == owner_id,
        HealthAssessment.assessment_date >= cutoff,
    )
    if profile_id:
        stmt_v = stmt_v.where(HealthAssessment.care_profile_id == profile_id)
    assessments = db.scalars(stmt_v.order_by(HealthAssessment.assessment_date.desc())).all()

    # Active medicines
    stmt_m = select(Medicine).where(
        Medicine.user_id == owner_id,
        Medicine.is_active == True,  # noqa: E712
    )
    if profile_id:
        stmt_m = stmt_m.where(Medicine.care_profile_id == profile_id)
    medicines = db.scalars(stmt_m).all()

    # Overall adherence
    scope_obj = ProfileScope(
        owner_id=owner_id,
        profile_id=profile_id or 0,
        profile=share.care_profile,
        can_write=False,
        is_caregiver=False,
        caller_user=user,
    ) if profile_id and share.care_profile else user
    adherence = medicine_service.get_overall_adherence_summary(db, scope_obj, days=share.days_range)

    # Append-only notes
    notes = [
        {
            "id": n.id,
            "author_name": n.author_name,
            "note_text": n.note_text,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "verification_status": "External note (unverified)",
            "is_unverified": True,
        }
        for n in share.notes
        if not n.is_hidden
    ]

    return {
        "patient_name": patient_name,
        "days_range": share.days_range,
        "questions_for_doctor": share.questions_for_doctor or [],
        "active_medicines": [
            {
                "name": m.name,
                "dosage": m.dosage,
                "frequency": f"{m.frequency_times_per_day}x daily",
                "instructions": m.instructions,
            }
            for m in medicines
        ],
        "adherence_summary": {
            "period_days": adherence.get("days", share.days_range) if isinstance(adherence, dict) else getattr(adherence, "period_days", share.days_range),
            "overall_percent": adherence.get("adherence_percent") if isinstance(adherence, dict) else getattr(adherence, "overall_adherence_percent", None),
            "doses_taken": adherence.get("taken_count", 0) if isinstance(adherence, dict) else getattr(adherence, "total_doses_taken", 0),
            "doses_scheduled": adherence.get("scheduled_count", 0) if isinstance(adherence, dict) else getattr(adherence, "total_doses_scheduled", 0),
        },
        "recent_vitals": [
            {
                "date": str(a.assessment_date),
                "bp": f"{a.systolic_bp}/{a.diastolic_bp}" if a.systolic_bp and a.diastolic_bp else None,
                "heart_rate": a.heart_rate_bpm,
                "glucose": a.blood_glucose_mg_dl,
                "spo2": float(a.spo2_percent) if a.spo2_percent else None,
            }
            for a in assessments[:10]
        ],
        "doctor_review": {
            "doctor_name": share.doctor_name,
            "doctor_notes": share.doctor_notes,
            "doctor_reviewed_at": share.doctor_reviewed_at.isoformat() if share.doctor_reviewed_at else None,
            "doctor_recommendations": share.doctor_recommendations or [],
            "notes": notes,
        },
        "notes": notes,
        "disclaimer": "This summary is prepared from patient-entered logs to assist clinical consultation.",
    }


def submit_doctor_notes(
    db: Session,
    token: str,
    doctor_name: str,
    doctor_notes: str,
    doctor_recommendations: Optional[List[str]] = None,
) -> Dict[str, Any]:
    share = db.scalar(select(DoctorShare).where(DoctorShare.token == token))
    if not share or not share.is_valid():
        raise HTTPException(404, "This doctor summary link is invalid, expired, or has been revoked.")

    trimmed_notes = doctor_notes.strip()
    if len(trimmed_notes) > 2000:
        raise HTTPException(400, "Note text must not exceed 2000 characters.")

    author = doctor_name.strip() or "Healthcare Provider"
    note_content = f"External note (unverified): {trimmed_notes}"
    new_note = DoctorShareNote(
        doctor_share_id=share.id,
        author_name=author,
        note_text=note_content,
        is_hidden=False,
    )
    db.add(new_note)

    # CRITICAL: External link holders must NOT update official health record review fields:
    # doctor_reviewed_at and doctor_recommendations are strictly reserved for authenticated doctors.
    db.commit()
    db.refresh(new_note)

    return {
        "message": "Doctor note submitted (External note (unverified))",
        "note_id": new_note.id,
        "author_name": author,
        "note_text": note_content,
        "is_unverified": True,
        "verification_status": "External note (unverified)",
    }


def hide_doctor_note(db: Session, user: User, note_id: int) -> bool:
    """Allow patient to hide a note from public doctor share display."""
    note = db.scalar(
        select(DoctorShareNote)
        .join(DoctorShare, DoctorShareNote.doctor_share_id == DoctorShare.id)
        .where(DoctorShareNote.id == note_id, DoctorShare.user_id == user.id)
    )
    if not note:
        raise HTTPException(404, "Note not found")
    note.is_hidden = True
    db.commit()
    return True


def delete_doctor_note(db: Session, user: User, note_id: int) -> bool:
    """Allow patient to permanently delete a note left on their doctor share link."""
    note = db.scalar(
        select(DoctorShareNote)
        .join(DoctorShare, DoctorShareNote.doctor_share_id == DoctorShare.id)
        .where(DoctorShareNote.id == note_id, DoctorShare.user_id == user.id)
    )
    if not note:
        raise HTTPException(404, "Note not found")
    db.delete(note)
    db.commit()
    return True

