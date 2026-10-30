import secrets
from typing import List, Optional
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.care_profile import (
    CareProfile, CaregiverAccess, CaregiverInviteStatus, RelationshipType,
)
from app.models.user import User
from app.schemas.care_profile import CareProfileCreate, CareProfileUpdate, CaregiverInviteCreate


def get_or_create_primary_profile(db: Session, user: User) -> CareProfile:
    """Ensures every user has at least one primary profile representing themselves."""
    profile = db.scalar(
        select(CareProfile).where(
            CareProfile.account_owner_id == user.id,
            CareProfile.is_primary == True,  # noqa: E712
        )
    )
    if not profile:
        profile = CareProfile(
            account_owner_id=user.id,
            full_name=user.full_name or "Me",
            relationship_type=RelationshipType.SELF,
            date_of_birth=user.date_of_birth,
            gender=str(user.gender or "OTHER"),
            avatar_color="#0f766e",
            is_primary=True,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


def list_profiles(db: Session, user: User) -> List[CareProfile]:
    # Ensure primary exists
    get_or_create_primary_profile(db, user)
    return list(
        db.scalars(
            select(CareProfile)
            .where(CareProfile.account_owner_id == user.id)
            .order_by(CareProfile.is_primary.desc(), CareProfile.created_at.asc())
        ).all()
    )


def create_profile(db: Session, user: User, data: CareProfileCreate) -> CareProfile:
    profile = CareProfile(
        account_owner_id=user.id,
        full_name=data.full_name,
        relationship_type=data.relationship,
        date_of_birth=data.date_of_birth,
        gender=data.gender or "OTHER",
        avatar_color=data.avatar_color or "#0f766e",
        is_primary=False,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def update_profile(db: Session, user: User, profile_id: int, data: CareProfileUpdate) -> CareProfile:
    profile = db.scalar(
        select(CareProfile).where(
            CareProfile.id == profile_id,
            CareProfile.account_owner_id == user.id,
        )
    )
    if not profile:
        raise HTTPException(404, "Care profile not found")

    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(profile, k, v)

    db.commit()
    db.refresh(profile)
    return profile


def delete_profile(db: Session, user: User, profile_id: int) -> None:
    profile = db.scalar(
        select(CareProfile).where(
            CareProfile.id == profile_id,
            CareProfile.account_owner_id == user.id,
        )
    )
    if not profile:
        raise HTTPException(404, "Care profile not found")
    if profile.is_primary:
        raise HTTPException(400, "Cannot delete your primary profile")

    db.delete(profile)
    db.commit()


def list_caregivers(db: Session, user: User) -> List[CaregiverAccess]:
    return list(
        db.scalars(
            select(CaregiverAccess)
            .where(CaregiverAccess.account_owner_id == user.id)
            .order_by(CaregiverAccess.created_at.desc())
        ).all()
    )


from datetime import datetime, timezone
from app.utils.email import send_caregiver_invitation


def invite_caregiver(db: Session, user: User, data: CaregiverInviteCreate) -> CaregiverAccess:
    # Prevent inviting yourself
    if data.caregiver_email.lower().strip() == (user.email or "").lower().strip():
        raise HTTPException(400, "You cannot invite yourself as a caregiver.")

    # Prevent duplicate pending invites to the same email
    existing = db.scalar(
        select(CaregiverAccess).where(
            CaregiverAccess.account_owner_id == user.id,
            CaregiverAccess.caregiver_email == data.caregiver_email.lower(),
            CaregiverAccess.status == CaregiverInviteStatus.PENDING,
        )
    )
    if existing:
        raise HTTPException(409, "A pending invitation already exists for this email address.")

    token = secrets.token_urlsafe(32)
    invite = CaregiverAccess(
        account_owner_id=user.id,
        caregiver_email=data.caregiver_email.lower(),
        access_level=data.access_level,
        invite_token=token,
        status=CaregiverInviteStatus.PENDING,
        notify_missed_dose=data.notify_missed_dose,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)

    # Send invitation email
    sent = False
    try:
        sent = send_caregiver_invitation(
            to=invite.caregiver_email,
            inviter_name=user.full_name or "A HealthPredict user",
            token=token,
            access_level=data.access_level.value if hasattr(data.access_level, "value") else str(data.access_level),
        )
    except Exception as e:
        logger.warning("Failed to dispatch caregiver invitation email: %s", e)
        sent = False

    invite.email_delivered = bool(sent)
    invite.email_delivery_status = "DELIVERED" if sent else "FAILED"
    db.commit()
    db.refresh(invite)
    return invite


def revoke_caregiver(db: Session, user: User, invite_id: int) -> None:
    invite = db.scalar(
        select(CaregiverAccess).where(
            CaregiverAccess.id == invite_id,
            CaregiverAccess.account_owner_id == user.id,
        )
    )
    if not invite:
        raise HTTPException(404, "Caregiver invite not found")
    invite.status = CaregiverInviteStatus.REVOKED
    db.commit()


def get_invite_info(db: Session, token: str) -> dict:
    invite = db.scalar(
        select(CaregiverAccess).where(CaregiverAccess.invite_token == token)
    )
    if not invite or invite.status == CaregiverInviteStatus.REVOKED:
        raise HTTPException(404, "Invitation is invalid or has been revoked")

    owner = db.get(User, invite.account_owner_id)
    inviter_name = owner.full_name if owner else "A HealthPredict user"
    return {
        "caregiver_email": invite.caregiver_email,
        "inviter_name": inviter_name,
        "access_level": invite.access_level,
        "status": invite.status,
    }


def accept_caregiver_invite(db: Session, user: User, token: str) -> CaregiverAccess:
    invite = db.scalar(
        select(CaregiverAccess).where(CaregiverAccess.invite_token == token)
    )
    if not invite:
        raise HTTPException(404, "Invitation not found")
    if invite.status == CaregiverInviteStatus.REVOKED:
        raise HTTPException(400, "This invitation has been revoked by the account owner")
    if invite.status == CaregiverInviteStatus.ACCEPTED:
        return invite

    # Email mismatch check
    user_email = (user.email or "").strip().lower()
    if invite.caregiver_email.strip().lower() != user_email:
        raise HTTPException(
            403,
            f"This invitation was sent to {invite.caregiver_email}. "
            f"Please sign in with that email address to accept it.",
        )

    invite.status = CaregiverInviteStatus.ACCEPTED
    invite.accepted_at = datetime.now(timezone.utc)
    invite.caregiver_user_id = user.id
    db.commit()
    db.refresh(invite)
    return invite


def list_cared_for_profiles(db: Session, user: User) -> list[dict]:
    user_email = (user.email or "").strip().lower()
    grants = list(
        db.scalars(
            select(CaregiverAccess).where(
                CaregiverAccess.status == CaregiverInviteStatus.ACCEPTED,
                (CaregiverAccess.caregiver_email == user_email) | (CaregiverAccess.caregiver_user_id == user.id),
            ).order_by(CaregiverAccess.accepted_at.desc())
        ).all()
    )

    results = []
    for grant in grants:
        owner = db.get(User, grant.account_owner_id)
        if not owner:
            continue
        profiles = list(
            db.scalars(
                select(CareProfile)
                .where(CareProfile.account_owner_id == owner.id)
                .order_by(CareProfile.is_primary.desc(), CareProfile.created_at.asc())
            ).all()
        )
        results.append({
            "caregiver_access_id": grant.id,
            "owner_id": owner.id,
            "owner_name": owner.full_name or "Account Owner",
            "access_level": grant.access_level,
            "notify_missed_dose": grant.notify_missed_dose,
            "accepted_at": grant.accepted_at,
            "profiles": profiles,
        })
    return results

