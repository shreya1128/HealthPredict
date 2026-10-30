from datetime import datetime, timezone
import enum
from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import relationship as orm_relationship, synonym

from app.config.database import Base
from app.models.user import PK


class RelationshipType(str, enum.Enum):
    SELF = "SELF"
    CHILD = "CHILD"
    PARENT = "PARENT"
    SPOUSE = "SPOUSE"
    OTHER = "OTHER"


class CaregiverAccessLevel(str, enum.Enum):
    VIEW_ONLY = "VIEW_ONLY"
    EDIT = "EDIT"


class CaregiverInviteStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REVOKED = "REVOKED"


class CareProfile(Base):
    __tablename__ = "care_profiles"

    id = Column(PK, primary_key=True, autoincrement=True)
    account_owner_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    relationship = Column("relationship", Enum(RelationshipType), default=RelationshipType.OTHER, nullable=False)
    relationship_type = synonym("relationship")
    date_of_birth = Column(Date, nullable=True)
    gender = Column(String(50), default="OTHER", nullable=False)
    avatar_color = Column(String(20), default="#0f766e", nullable=False)
    is_primary = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    owner = orm_relationship("User", backref="care_profiles")

    @property
    def is_child(self) -> bool:
        if self.relationship == RelationshipType.CHILD:
            return True
        if self.date_of_birth:
            today = datetime.now(timezone.utc).date()
            age = today.year - self.date_of_birth.year - (
                (today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day)
            )
            return age < 18
        return False

    @property
    def clinical_notice(self) -> str | None:
        if self.is_child:
            return "Standard adult vitals ranges may not apply to children. Please consult your pediatrician or healthcare provider."
        return None



class CaregiverAccess(Base):
    __tablename__ = "caregiver_access"

    id = Column(PK, primary_key=True, autoincrement=True)
    account_owner_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    caregiver_email = Column(String(255), nullable=False, index=True)
    access_level = Column(Enum(CaregiverAccessLevel), default=CaregiverAccessLevel.VIEW_ONLY, nullable=False)
    invite_token = Column(String(64), unique=True, nullable=False)
    status = Column(Enum(CaregiverInviteStatus), default=CaregiverInviteStatus.PENDING, nullable=False)
    notify_missed_dose = Column(Boolean, default=True, nullable=False)
    email_delivered = Column(Boolean, default=False, nullable=False)
    email_delivery_status = Column(String(50), default="QUEUED", nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    caregiver_user_id = Column(PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    owner = orm_relationship("User", foreign_keys=[account_owner_id], backref="caregiver_invites")
    caregiver_user = orm_relationship("User", foreign_keys=[caregiver_user_id], backref="caregiving_grants")


