"""Wellness tracking models (exercise, sleep, hydration, nutrition, goals).

Mirror database/schema.sql exactly. goal_progress (a historical snapshot table) is intentionally
NOT modeled here - see services/goal_service.py's module docstring for why.
"""

from sqlalchemy import JSON, Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, SmallInteger, String, Text, Time
from sqlalchemy.orm import relationship

from app.config.database import Base
from app.models.user import PK
from app.utils.timeutil import utcnow


class Intensity:
    LOW = "LOW"; MODERATE = "MODERATE"; HIGH = "HIGH"


class MealType:
    BREAKFAST = "BREAKFAST"; LUNCH = "LUNCH"; DINNER = "DINNER"; SNACK = "SNACK"


class GoalType:
    EXERCISE = "EXERCISE"; SLEEP = "SLEEP"; HYDRATION = "HYDRATION"
    WEIGHT = "WEIGHT"; MEDICINE_ADHERENCE = "MEDICINE_ADHERENCE"; OTHER = "OTHER"


class GoalStatus:
    ACTIVE = "ACTIVE"; PAUSED = "PAUSED"; COMPLETED = "COMPLETED"; ABANDONED = "ABANDONED"


class ExerciseLog(Base):
    __tablename__ = "exercise_logs"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    exercise_date = Column(Date, nullable=False)
    exercise_type = Column(String(100), nullable=False)
    duration_minutes = Column(Integer)
    intensity = Column(String(10), default=Intensity.MODERATE)
    calories_burned = Column(Integer)
    distance_km = Column(Numeric(10, 2))
    source = Column(String(50), default="manual", nullable=False)
    notes = Column(Text)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="exercise_logs")
    care_profile = relationship("CareProfile", backref="exercise_logs")


class SleepLog(Base):
    __tablename__ = "sleep_logs"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    sleep_date = Column(Date, nullable=False)
    bedtime = Column(Time)
    wake_time = Column(Time)
    sleep_duration_hours = Column(Numeric(4, 2))
    sleep_quality = Column(Integer)
    source = Column(String(50), default="manual", nullable=False)
    notes = Column(Text)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="sleep_logs")
    care_profile = relationship("CareProfile", backref="sleep_logs")


class HydrationLog(Base):
    __tablename__ = "hydration_logs"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    hydration_date = Column(Date, nullable=False)
    water_intake_ml = Column(Integer, nullable=False)
    entry_time = Column(Time)
    notes = Column(Text)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="hydration_logs")
    care_profile = relationship("CareProfile", backref="hydration_logs")


class NutritionLog(Base):
    __tablename__ = "nutrition_logs"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    nutrition_date = Column(Date, nullable=False)
    meal_type = Column(String(10), nullable=False)
    food_item = Column(String(255))
    calories = Column(Integer)
    portion_size = Column(String(100))
    macros = Column(JSON)
    notes = Column(Text)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", back_populates="nutrition_logs")
    care_profile = relationship("CareProfile", backref="nutrition_logs")


class WellnessGoal(Base):
    __tablename__ = "wellness_goals"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    goal_type = Column(String(20), nullable=False)
    goal_description = Column(String(255))
    target_value = Column(Numeric(10, 2))
    # Baseline value captured at creation (e.g. initial starting weight for weight goals)
    baseline_value = Column(Numeric(10, 2))
    # User-logged manual percentage for custom goals (OTHER)
    manual_percentage = Column(Numeric(5, 2))
    unit = Column(String(50))
    start_date = Column(Date, nullable=False)
    end_date = Column(Date)
    is_achieved = Column(Boolean, default=False)
    status = Column(String(10), default=GoalStatus.ACTIVE)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="wellness_goals")
    care_profile = relationship("CareProfile", backref="wellness_goals")
    progress_history = relationship("GoalProgress", back_populates="goal", cascade="all, delete-orphan")


class GoalProgress(Base):
    """Historical snapshot of progress toward a wellness goal."""

    __tablename__ = "goal_progress"

    id = Column(PK, primary_key=True, autoincrement=True)
    goal_id = Column(PK, ForeignKey("wellness_goals.id", ondelete="CASCADE"), nullable=False)
    progress_date = Column(Date, nullable=False)
    progress_value = Column(Numeric(10, 2))
    percentage_complete = Column(Numeric(5, 2))
    notes = Column(Text)
    created_at = Column(DateTime, default=utcnow)

    goal = relationship("WellnessGoal", back_populates="progress_history")


class WeeklyReport(Base):
    __tablename__ = "weekly_reports"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    week_start_date = Column(Date, nullable=False)
    week_end_date = Column(Date, nullable=False)
    average_health_score = Column(Numeric(5, 2))
    weight_change_kg = Column(Numeric(6, 2))
    total_exercise_minutes = Column(Integer)
    average_sleep_duration = Column(Numeric(4, 2))
    average_hydration_ml = Column(Integer)
    medicine_adherence_percent = Column(Numeric(5, 2))
    goals_progress_percent = Column(Numeric(5, 2))
    significant_changes = Column(JSON)
    recommendations = Column(JSON)
    pdf_file_path = Column(String(500))
    created_at = Column(DateTime, default=utcnow)

    care_profile = relationship("CareProfile", backref="weekly_reports")

