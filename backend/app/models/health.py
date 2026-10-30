"""Health assessment models. Mirror database/schema.sql exactly (types, nullability)."""

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, JSON, Numeric, SmallInteger, String, Text
from sqlalchemy.orm import relationship

from app.models.user import PK
from app.utils.timeutil import utcnow


from app.config.database import Base


class RiskCategory:
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"


class AssessmentStatus:
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    REVIEWED = "REVIEWED"


class HealthAssessment(Base):
    __tablename__ = "health_assessments"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    assessment_date = Column(Date, nullable=False)

    systolic_bp = Column(SmallInteger)
    diastolic_bp = Column(SmallInteger)
    heart_rate_bpm = Column(SmallInteger)
    blood_glucose_mg_dl = Column(SmallInteger)
    spo2_percent = Column(Numeric(5, 2))
    temperature_celsius = Column(Numeric(5, 2))

    health_score = Column(Numeric(5, 2))
    risk_category = Column(String(10), default=RiskCategory.LOW)
    score_breakdown = Column(JSON)
    data_completeness_percent = Column(Numeric(5, 2))

    assessment_notes = Column(Text)
    status = Column(String(10), default=AssessmentStatus.PENDING)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="health_assessments")
    care_profile = relationship("CareProfile", backref="health_assessments")
    prediction = relationship("HealthPrediction", back_populates="assessment", uselist=False,
                             cascade="all, delete-orphan")


class HealthHistory(Base):
    """One row per profile per day - upserted whenever a same-day assessment is completed
    (later assessments the same day overwrite that day's row). Powers trend charts."""

    __tablename__ = "health_history"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    tracking_date = Column(Date, nullable=False)

    health_score = Column(Numeric(5, 2))
    weight_kg = Column(Numeric(6, 2))
    bmi = Column(Numeric(5, 2))
    systolic_bp = Column(SmallInteger)
    diastolic_bp = Column(SmallInteger)
    heart_rate_bpm = Column(SmallInteger)
    blood_glucose_mg_dl = Column(SmallInteger)
    spo2_percent = Column(Numeric(5, 2))
    risk_category = Column(String(10), default=RiskCategory.LOW)

    created_at = Column(DateTime, default=utcnow)
    care_profile = relationship("CareProfile", backref="health_history")



class HealthPrediction(Base):
    """ML-based prediction (Phase 4/5 model), distinct from the rule-based health_score on
    HealthAssessment. One per assessment (unique FK) - computed once, at assessment creation
    time, from a snapshot of the profile; not recomputed if the profile changes later."""

    __tablename__ = "health_predictions"

    id = Column(PK, primary_key=True, autoincrement=True)
    assessment_id = Column(PK, ForeignKey("health_assessments.id", ondelete="CASCADE"),
                           unique=True, nullable=False)

    prediction_score = Column(Numeric(5, 4))       # predict_proba, 0-1
    risk_level = Column(String(10), default=RiskCategory.MODERATE)
    confidence_percent = Column(Numeric(5, 2))     # |probability - 0.5| * 200; see prediction_service.py
    feature_importance = Column(JSON)              # static global importances (ml/saved_models/model_info.json)
    model_version = Column(String(50))
    shap_values = Column(JSON)                     # raw per-feature log-odds contributions, this prediction
    prediction_factors = Column(JSON)               # ranked, human-readable top factors for the UI
    explanation_text = Column(Text)

    created_at = Column(DateTime, default=utcnow)

    assessment = relationship("HealthAssessment", back_populates="prediction")


class MLModelInfo(Base):
    __tablename__ = "ml_model_info"

    id = Column(PK, primary_key=True, autoincrement=True)
    model_name = Column(String(255), nullable=False)
    model_version = Column(String(50))
    algorithm = Column(String(100))
    accuracy = Column(Numeric(5, 4))
    precision = Column(Numeric(5, 4))
    recall = Column(Numeric(5, 4))
    f1_score = Column(Numeric(5, 4))
    roc_auc = Column(Numeric(5, 4))
    training_date = Column(DateTime)
    training_samples = Column(Integer)
    feature_count = Column(Integer)
    is_active = Column(Boolean, default=False)
    metadata_json = Column("metadata", JSON)
    created_at = Column(DateTime, default=utcnow)

