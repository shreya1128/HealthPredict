"""Menstrual tracking and PCOS educational screening models.

User-controlled cycle tracking, period logs, symptom records, and decoupled
educational PCOS screening.
"""

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.config.database import Base
from app.models.user import PK
from app.utils.timeutil import utcnow


class MenstrualLog(Base):
    __tablename__ = "menstrual_logs"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    period_start_date = Column(Date, nullable=False)
    period_end_date = Column(Date, nullable=True)
    cycle_length_days = Column(Integer, nullable=True)
    period_duration_days = Column(Integer, nullable=True)
    flow_intensity = Column(String(20), nullable=True)  # LIGHT, MEDIUM, HEAVY, SPOTTING
    pain_level = Column(Integer, nullable=True)  # 0 to 10
    symptoms = Column(JSON, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class PCOSScreening(Base):
    __tablename__ = "pcos_screenings"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    screening_date = Column(Date, nullable=False)
    cycle_regularity = Column(String(30), nullable=False)  # REGULAR, IRREGULAR, INFREQUENT
    excess_androgen_symptoms = Column(JSON, nullable=False)
    metabolic_indicators = Column(JSON, nullable=False)
    ultrasound_findings = Column(String(50), nullable=True)  # NOT_DONE, NORMAL, POLYCYSTIC_MORPHOLOGY
    symptom_count = Column(Integer, nullable=False)
    risk_assessment_text = Column(String(150), nullable=False)
    educational_guidance = Column(Text, nullable=False)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
