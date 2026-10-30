"""Profile Scope Middleware & Dependency.

Enforces family care profile isolation and caregiver authorization:
- No header: caller's own primary profile
- X-Profile-Id of another account without accepted caregiver grant: 404 (same as missing)
- Accepted caregiver: owner's data with can_write = (grant.access_level == EDIT)
- Mutating routes require write scope (VIEW_ONLY gets 403)
"""

from dataclasses import dataclass
from typing import Optional
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.middleware.auth import get_current_user
from app.models.care_profile import (
    CareProfile, CaregiverAccess, CaregiverAccessLevel, CaregiverInviteStatus, RelationshipType,
)
from app.models.user import User


@dataclass
class ProfileScope:
    owner_id: int            # Account owner's user id (whose data is being accessed)
    profile_id: int          # The care_profile.id
    profile: CareProfile     # The CareProfile record
    can_write: bool          # True if caller is owner or accepted caregiver with EDIT permission
    is_caregiver: bool       # True if accessing via caregiver grant
    caller_user: User        # Authenticated user making the request


def get_profile_scope(
    x_profile_id: Optional[str] = Header(None, alias="X-Profile-Id"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileScope:
    # 1. No header: default to caller's own primary profile
    if not x_profile_id or str(x_profile_id).strip().lower() in ("null", "undefined", ""):
        primary = db.scalar(
            select(CareProfile).where(
                CareProfile.account_owner_id == user.id,
                CareProfile.is_primary == True,
            )
        )
        if not primary:
            # Create primary profile if missing
            primary = CareProfile(
                account_owner_id=user.id,
                full_name=user.full_name or "Me",
                relationship=RelationshipType.SELF,
                date_of_birth=user.date_of_birth,
                gender=str(user.gender or "OTHER"),
                avatar_color="#0f766e",
                is_primary=True,
            )
            db.add(primary)
            db.commit()
            db.refresh(primary)
        return ProfileScope(
            owner_id=user.id,
            profile_id=primary.id,
            profile=primary,
            can_write=True,
            is_caregiver=False,
            caller_user=user,
        )

    # 2. X-Profile-Id header is provided:
    try:
        pid = int(str(x_profile_id).strip())
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")

    target_profile = db.get(CareProfile, pid)
    if not target_profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")

    # If profile belongs to the caller:
    if target_profile.account_owner_id == user.id:
        return ProfileScope(
            owner_id=user.id,
            profile_id=target_profile.id,
            profile=target_profile,
            can_write=True,
            is_caregiver=False,
            caller_user=user,
        )

    # If profile belongs to another account, check if caller is an ACCEPTED caregiver:
    user_email = (user.email or "").strip().lower()
    caregiver_grant = db.scalar(
        select(CaregiverAccess).where(
            CaregiverAccess.account_owner_id == target_profile.account_owner_id,
            CaregiverAccess.status == CaregiverInviteStatus.ACCEPTED,
            (CaregiverAccess.caregiver_email == user_email) | (CaregiverAccess.caregiver_user_id == user.id),
        )
    )

    if not caregiver_grant:
        # "a profile id of another account returns 404 (same as missing)"
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")

    # Caregivers cannot access the account owner's own primary profile
    # (they should only access family member profiles they were invited for)
    if target_profile.is_primary:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")

    can_write = (caregiver_grant.access_level == CaregiverAccessLevel.EDIT)
    return ProfileScope(
        owner_id=target_profile.account_owner_id,
        profile_id=target_profile.id,
        profile=target_profile,
        can_write=can_write,
        is_caregiver=True,
        caller_user=user,
    )


def require_write_scope(
    scope: ProfileScope = Depends(get_profile_scope),
) -> ProfileScope:
    if not scope.can_write:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "You have view-only access to this profile. Editing is not permitted.",
        )
    return scope
