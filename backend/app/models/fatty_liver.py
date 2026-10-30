"""Fatty Liver Risk Awareness model based on metabolic risk factors (MASLD/NAFLD).

Educational risk-factor checklist and clinical awareness only. Decoupled from predictive models.
"""

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.config.database import Base
from app.models.user import PK
from app.utils.timeutil import utcnow


class FattyLiverScreening(Base):
    __tablename__ = "fatty_liver_screenings"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    screening_date = Column(Date, nullable=False)
    bmi = Column(Numeric(5, 2), nullable=False)
    waist_circumference_cm = Column(Numeric(5, 2), nullable=False)
    has_hypertension = Column(Boolean, nullable=False, default=False)
    has_type2_diabetes_or_prediabetes = Column(Boolean, nullable=False, default=False)
    high_triglycerides = Column(Boolean, nullable=False, default=False)
    low_hdl = Column(Boolean, nullable=False, default=False)
    alcohol_units_weekly = Column(Integer, nullable=False, default=0)
    alt_u_l = Column(Numeric(6, 2), nullable=True)
    ast_u_l = Column(Numeric(6, 2), nullable=True)
    prior_imaging_steatosis = Column(String(30), nullable=True)
    metabolic_factors_count = Column(Integer, nullable=False)
    risk_level = Column(String(30), nullable=False)
    risk_summary = Column(String(150), nullable=False)
    educational_guidance = Column(Text, nullable=False)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
