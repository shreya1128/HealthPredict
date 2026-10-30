from datetime import date, datetime
import re
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.care_profile import CaregiverAccessLevel, CaregiverInviteStatus, RelationshipType


class CareProfileBase(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    relationship: RelationshipType = RelationshipType.OTHER
    date_of_birth: Optional[date] = None
    gender: Optional[str] = "OTHER"
    avatar_color: Optional[str] = "#0f766e"

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = re.sub(r'<[^>]*>', '', v).strip()
        v = v.replace('<', '').replace('>', '').strip()
        if len(v) < 1:
            raise ValueError("Full name must be at least 1 character")
        return v


class CareProfileCreate(CareProfileBase):
    pass


class CareProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    relationship: Optional[RelationshipType] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    avatar_color: Optional[str] = None

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = re.sub(r'<[^>]*>', '', v).strip()
        v = v.replace('<', '').replace('>', '').strip()
        if len(v) < 1:
            raise ValueError("Full name must be at least 1 character")
        return v


class CareProfileOut(CareProfileBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_owner_id: int
    is_primary: bool
    created_at: datetime
    updated_at: datetime
    is_child: bool = False
    clinical_notice: Optional[str] = None


class CaregiverInviteCreate(BaseModel):
    caregiver_email: EmailStr
    access_level: CaregiverAccessLevel = CaregiverAccessLevel.VIEW_ONLY
    notify_missed_dose: bool = True


class CaregiverInviteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_owner_id: int
    caregiver_email: str
    access_level: CaregiverAccessLevel
    status: CaregiverInviteStatus
    notify_missed_dose: bool
    email_delivered: bool = False
    email_delivery_status: str = "QUEUED"
    created_at: datetime
    accepted_at: Optional[datetime] = None


class AcceptCaregiverInviteIn(BaseModel):
    token: str = Field(..., min_length=10, max_length=128)


class CaregiverInviteInfoOut(BaseModel):
    caregiver_email: str
    inviter_name: str
    access_level: CaregiverAccessLevel
    status: CaregiverInviteStatus


class CaredForOwnerOut(BaseModel):
    caregiver_access_id: int
    owner_id: int
    owner_name: str
    access_level: CaregiverAccessLevel
    notify_missed_dose: bool
    accepted_at: Optional[datetime]
    profiles: list[CareProfileOut]

