from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.schemas.care_profile import (
    AcceptCaregiverInviteIn, CaredForOwnerOut, CareProfileCreate, CareProfileOut, CareProfileUpdate,
    CaregiverInviteCreate, CaregiverInviteInfoOut, CaregiverInviteOut,
)
from app.services import care_profile_service

router = APIRouter()


@router.get("", response_model=List[CareProfileOut])
def get_care_profiles(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List all managed profiles (family members) under this account."""
    return care_profile_service.list_profiles(db, user)


@router.post("", response_model=CareProfileOut, status_code=status.HTTP_201_CREATED)
def create_care_profile(data: CareProfileCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Add a new profile (e.g. child, parent, spouse)."""
    return care_profile_service.create_profile(db, user, data)


@router.put("/{profile_id}", response_model=CareProfileOut)
def update_care_profile(profile_id: int, data: CareProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update profile information."""
    return care_profile_service.update_profile(db, user, profile_id, data)


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_care_profile(profile_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a managed profile (cannot delete primary)."""
    care_profile_service.delete_profile(db, user, profile_id)
    return None


@router.get("/caregivers/invites", response_model=List[CaregiverInviteOut])
def list_caregivers(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List caregiver invitations and access permissions."""
    return care_profile_service.list_caregivers(db, user)


@router.post("/caregivers/invite", response_model=CaregiverInviteOut, status_code=status.HTTP_201_CREATED)
def invite_caregiver(data: CaregiverInviteCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Invite a caregiver to view or manage records."""
    return care_profile_service.invite_caregiver(db, user, data)


@router.delete("/caregivers/invite/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_caregiver(invite_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Revoke caregiver access."""
    care_profile_service.revoke_caregiver(db, user, invite_id)
    return None


@router.get("/caregivers/invite-info", response_model=CaregiverInviteInfoOut)
def get_caregiver_invite_info(token: str, db: Session = Depends(get_db)):
    """Public endpoint to inspect caregiver invite details for accept page."""
    return care_profile_service.get_invite_info(db, token)


@router.post("/caregivers/accept", response_model=CaregiverInviteOut)
def accept_caregiver_invite(
    data: AcceptCaregiverInviteIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept an invitation to become a caregiver."""
    return care_profile_service.accept_caregiver_invite(db, user, data.token)


@router.get("/cared-for", response_model=List[CaredForOwnerOut])
def list_cared_for_profiles(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List all accounts and profiles the current user has accepted caregiver access for."""
    return care_profile_service.list_cared_for_profiles(db, user)

