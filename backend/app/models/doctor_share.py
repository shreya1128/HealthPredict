from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.config.database import Base
from app.models.user import PK


class DoctorShare(Base):
    __tablename__ = "doctor_shares"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    days_range = Column(Integer, default=30, nullable=False)
    questions_for_doctor = Column(JSON, nullable=True)
    doctor_name = Column(String(255), nullable=True)
    doctor_notes = Column(Text, nullable=True)
    doctor_reviewed_at = Column(DateTime, nullable=True)
    doctor_recommendations = Column(JSON, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    is_revoked = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="doctor_shares")
    care_profile = relationship("CareProfile", backref="doctor_shares")

    def is_valid(self) -> bool:
        if self.is_revoked:
            return False
        now = datetime.now(timezone.utc)
        exp = self.expires_at if self.expires_at.tzinfo else self.expires_at.replace(tzinfo=timezone.utc)
        return exp > now


class DoctorShareNote(Base):
    __tablename__ = "doctor_share_notes"

    id = Column(PK, primary_key=True, autoincrement=True)
    doctor_share_id = Column(PK, ForeignKey("doctor_shares.id", ondelete="CASCADE"), nullable=False, index=True)
    author_name = Column(String(255), nullable=False)
    note_text = Column(String(2000), nullable=False)
    is_hidden = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    doctor_share = relationship("DoctorShare", backref="notes")
