from datetime import datetime, timezone
import enum
from sqlalchemy import Boolean, Column, Date, DateTime, Enum, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.config.database import Base
from app.models.user import PK


class AppointmentStatus(str, enum.Enum):
    UPCOMING = "UPCOMING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class EmergencyCard(Base):
    __tablename__ = "emergency_cards"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), unique=True, nullable=True, index=True)
    public_token = Column(String(64), unique=True, nullable=False, index=True)
    blood_type = Column(String(10), nullable=True)
    allergies = Column(JSON, nullable=True)
    chronic_conditions = Column(JSON, nullable=True)
    current_medications = Column(JSON, nullable=True)
    emergency_contact_name = Column(String(255), nullable=True)
    emergency_contact_phone = Column(String(30), nullable=True)
    emergency_contact_relationship = Column(String(100), nullable=True)
    organ_donor = Column(Boolean, default=False, nullable=False)
    medical_notes = Column(Text, nullable=True)
    is_public = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="emergency_card")
    care_profile = relationship("CareProfile", backref="emergency_card", passive_deletes=True)


class SymptomLog(Base):
    __tablename__ = "symptom_logs"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    symptom_name = Column(String(255), nullable=False)
    severity = Column(Integer, nullable=False)  # 1 to 5
    logged_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="symptom_logs")
    care_profile = relationship("CareProfile", backref="symptom_logs", passive_deletes=True)


class DoctorAppointment(Base):
    __tablename__ = "doctor_appointments"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    doctor_name = Column(String(255), nullable=False)
    specialty = Column(String(100), nullable=True)
    location = Column(String(255), nullable=True)
    appointment_date = Column(DateTime, nullable=False)
    reason_for_visit = Column(String(255), nullable=True)
    questions_to_ask = Column(JSON, nullable=True)
    doctor_notes = Column(Text, nullable=True)
    followup_date = Column(Date, nullable=True)
    status = Column(Enum(AppointmentStatus), default=AppointmentStatus.UPCOMING, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="doctor_appointments")
    care_profile = relationship("CareProfile", backref="doctor_appointments", passive_deletes=True)

