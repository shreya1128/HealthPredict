"""API routes for Emergency Card, Symptom Diary, Doctor Appointments, and QR Generation."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.config.settings import settings
from app.middleware.profile_scope import ProfileScope, get_profile_scope, require_write_scope
from app.schemas.emergency_and_symptoms import (
    AppointmentCreate,
    AppointmentOut,
    AppointmentPrepOut,
    AppointmentUpdate,
    EmergencyCardOut,
    EmergencyCardUpdate,
    PublicEmergencyCardOut,
    SymptomAnalyticsOut,
    SymptomLogCreate,
    SymptomLogOut,
)
from app.services import emergency_service
from app.utils.qr_generator import generate_qr_response
from app.utils.rate_limiter import rate_limit_auth

router = APIRouter()


# ──────────────────────────────────────────────
# Emergency Card & QR Code
# ──────────────────────────────────────────────

@router.get("/emergency-card", response_model=EmergencyCardOut)
def get_user_emergency_card(
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Get the active profile's emergency card (creates if not existing)."""
    return emergency_service.get_or_create_card(db, scope)


@router.put("/emergency-card", response_model=EmergencyCardOut)
def update_user_emergency_card(
    data: EmergencyCardUpdate,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    """Update the active profile's emergency card details."""
    return emergency_service.update_card(db, scope, data)


@router.post("/emergency-card/regenerate-link", response_model=EmergencyCardOut)
def regenerate_emergency_card_link(
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    """Regenerate public access token for the emergency card, invalidating old links."""
    return emergency_service.regenerate_card_token(db, scope)


@router.patch("/emergency-card/visibility", response_model=EmergencyCardOut)
def toggle_emergency_card_visibility(
    is_public: bool = Query(..., description="Whether the emergency card is accessible publicly via token"),
    consent_acknowledged: bool = Query(False, description="Consent acknowledgment is required to make the emergency card public"),
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    """Toggle public sharing status for the emergency card."""
    return emergency_service.set_card_visibility(
        db, scope, is_public=is_public, consent_acknowledged=consent_acknowledged
    )


@router.get("/emergency-card/qr")
def get_emergency_card_qr(
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Return an SVG QR code pointing directly to the emergency card's public URL."""
    card = emergency_service.get_or_create_card(db, scope)
    target_url = f"{settings.APP_URL}/e/{card.public_token}"
    return generate_qr_response(target_url, size=240)


@router.get("/emergency-card/public/{token}", response_model=PublicEmergencyCardOut, dependencies=[Depends(rate_limit_auth)])
def get_public_emergency_card(
    token: str,
    db: Session = Depends(get_db),
):
    """Public read-only emergency card view accessed via QR code / link."""
    card = emergency_service.get_public_card(db, token)
    if not card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Emergency card not found or has been made private",
        )
    return card


@router.get("/emergency-card/public/{token}/qr", dependencies=[Depends(rate_limit_auth)])
def get_public_emergency_card_qr(
    token: str,
    db: Session = Depends(get_db),
):
    """Public QR code endpoint returning the vector SVG for this public emergency token."""
    card = emergency_service.get_public_card(db, token)
    if not card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Emergency card not found or has been made private",
        )
    target_url = f"{settings.APP_URL}/e/{token}"
    return generate_qr_response(target_url, size=240)


# ──────────────────────────────────────────────
# Symptom Log & Analytics
# ──────────────────────────────────────────────

@router.post("/symptoms", response_model=SymptomLogOut, status_code=status.HTTP_201_CREATED)
def record_symptom(
    data: SymptomLogCreate,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    """Log a symptom with severity rating (1-5)."""
    return emergency_service.log_symptom(db, scope, data)


@router.get("/symptoms", response_model=List[SymptomLogOut])
def list_user_symptoms(
    days: int = Query(default=30, ge=1, le=365),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Get recent symptom entries for active profile."""
    return emergency_service.list_symptoms(db, scope, days=days)


@router.get("/symptoms/analytics", response_model=SymptomAnalyticsOut)
def get_symptom_analytics(
    days: int = Query(default=30, ge=1, le=365),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Get symptom frequency, severity distribution, and progression trends."""
    return emergency_service.get_symptom_analytics(db, scope, days=days)


@router.delete("/symptoms/{symptom_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_symptom(
    symptom_id: int,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    """Delete a symptom log entry."""
    success = emergency_service.delete_symptom(db, scope, symptom_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Symptom entry not found",
        )
    return None


# ──────────────────────────────────────────────
# Doctor Appointments & Pre-Visit Preparation
# ──────────────────────────────────────────────

@router.post("/appointments", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
def schedule_appointment(
    data: AppointmentCreate,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    """Schedule a new doctor visit."""
    return emergency_service.create_appointment(db, scope, data)


@router.get("/appointments", response_model=List[AppointmentOut])
def list_user_appointments(
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """List all appointments for active profile."""
    return emergency_service.list_appointments(db, scope)


@router.get("/appointments/{appointment_id}/prep", response_model=AppointmentPrepOut)
def get_appointment_preparation(
    appointment_id: int,
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    """Generate pre-visit checklist, medications summary, and recent symptoms for doctor consultation."""
    prep = emergency_service.get_appointment_prep(db, scope, appointment_id)
    if not prep:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found",
        )
    return prep


@router.put("/appointments/{appointment_id}", response_model=AppointmentOut)
def update_user_appointment(
    appointment_id: int,
    data: AppointmentUpdate,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    """Update details, post-visit notes, or status for a scheduled appointment."""
    appt = emergency_service.update_appointment(db, scope, appointment_id, data)
    if not appt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found",
        )
    return appt


@router.delete("/appointments/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_appointment(
    appointment_id: int,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    """Delete an appointment."""
    success = emergency_service.delete_appointment(db, scope, appointment_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Appointment not found",
        )
    return None
