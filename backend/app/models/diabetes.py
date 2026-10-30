"""Diabetes risk screening model based on validated non-invasive scoring (ADA / FINDRISC)."""

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.config.database import Base
from app.models.user import PK
from app.utils.timeutil import utcnow


class DiabetesScreening(Base):
    __tablename__ = "diabetes_screenings"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    screening_date = Column(Date, nullable=False)
    method = Column(String(50), nullable=False, default="ADA_FINDRISC_V1")
    total_score = Column(Integer, nullable=False)
    risk_level = Column(String(20), nullable=False)  # LOW, SLIGHTLY_ELEVATED, MODERATE, HIGH, VERY_HIGH
    risk_probability_text = Column(String(100), nullable=False)
    input_data = Column(JSON, nullable=False)
    clinical_guidance = Column(Text, nullable=False)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
