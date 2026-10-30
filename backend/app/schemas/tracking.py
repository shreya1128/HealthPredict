"""Wellness tracking schemas: exercise, sleep, hydration, nutrition, goals."""

from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

IntensityLiteral = Literal["LOW", "MODERATE", "HIGH"]
MealTypeLiteral = Literal["BREAKFAST", "LUNCH", "DINNER", "SNACK"]
GoalTypeLiteral = Literal["EXERCISE", "SLEEP", "HYDRATION", "WEIGHT", "MEDICINE_ADHERENCE", "OTHER"]
GoalStatusLiteral = Literal["ACTIVE", "PAUSED", "COMPLETED", "ABANDONED"]


# ---------------------------------------------------------------------------
# Exercise
# ---------------------------------------------------------------------------

class ExerciseCreate(BaseModel):
    exercise_type: str = Field(min_length=1, max_length=100)
    exercise_date: date = Field(default_factory=date.today)
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    intensity: IntensityLiteral = "MODERATE"
    calories_burned: Optional[int] = Field(default=None, ge=0, le=10000)
    distance_km: Optional[Decimal] = Field(default=None, ge=0, le=1000, decimal_places=2)
    notes: Optional[str] = Field(default=None, max_length=2000)


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    exercise_date: date
    exercise_type: str
    duration_minutes: Optional[int] = None
    intensity: str
    calories_burned: Optional[int] = None
    distance_km: Optional[Decimal] = None
    source: Optional[str] = "manual"
    notes: Optional[str] = None
    created_at: Optional[datetime] = None


class ExerciseWeeklySummary(BaseModel):
    days: int
    total_minutes: int
    total_calories: int
    by_day: dict[str, int]  # ISO date -> minutes


# ---------------------------------------------------------------------------
# Sleep
# ---------------------------------------------------------------------------

class SleepCreate(BaseModel):
    sleep_date: date = Field(default_factory=date.today)
    bedtime: Optional[time] = None
    wake_time: Optional[time] = None
    sleep_quality: Optional[int] = Field(default=None, ge=1, le=10)
    notes: Optional[str] = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _bedtime_wake_pair(self):
        if (self.bedtime is None) != (self.wake_time is None):
            raise ValueError("Provide both bedtime and wake time, or neither")
        return self


class SleepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sleep_date: date
    bedtime: Optional[time] = None
    wake_time: Optional[time] = None
    sleep_duration_hours: Optional[Decimal] = None
    sleep_quality: Optional[int] = None
    source: Optional[str] = "manual"
    notes: Optional[str] = None
    created_at: Optional[datetime] = None


class SleepWeeklySummary(BaseModel):
    days: int
    average_duration_hours: Optional[float] = None
    average_quality: Optional[float] = None
    by_day: dict[str, Optional[float]]


# ---------------------------------------------------------------------------
# Hydration
# ---------------------------------------------------------------------------

class HydrationCreate(BaseModel):
    water_intake_ml: int = Field(gt=0, le=5000)
    hydration_date: date = Field(default_factory=date.today)
    entry_time: Optional[time] = None
    notes: Optional[str] = Field(default=None, max_length=500)


class HydrationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    hydration_date: date
    water_intake_ml: int
    entry_time: Optional[time] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None


class HydrationDailySummary(BaseModel):
    date_: date = Field(serialization_alias="date")
    total_ml: int
    goal_ml: Optional[int] = None
    percent_of_goal: Optional[float] = None


# ---------------------------------------------------------------------------
# Nutrition
# ---------------------------------------------------------------------------

class NutritionCreate(BaseModel):
    meal_type: MealTypeLiteral
    nutrition_date: date = Field(default_factory=date.today)
    food_item: Optional[str] = Field(default=None, max_length=255)
    calories: Optional[int] = Field(default=None, ge=0, le=10000)
    portion_size: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=1000)


class NutritionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nutrition_date: date
    meal_type: str
    food_item: Optional[str] = None
    calories: Optional[int] = None
    portion_size: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None


class NutritionDailySummary(BaseModel):
    date_: date = Field(serialization_alias="date")
    total_calories: int
    meals_logged: list[MealTypeLiteral]
    entries: list[NutritionOut]


# ---------------------------------------------------------------------------
# Goals
# ---------------------------------------------------------------------------

class GoalCreate(BaseModel):
    goal_type: GoalTypeLiteral
    goal_description: Optional[str] = Field(default=None, max_length=255)
    target_value: Decimal = Field(gt=0, le=100000, decimal_places=2)
    baseline_value: Optional[Decimal] = Field(default=None, gt=0, le=100000, decimal_places=2)
    manual_percentage: Optional[Decimal] = Field(default=None, ge=0, le=100, decimal_places=2)
    unit: Optional[str] = Field(default=None, max_length=50)
    start_date: date = Field(default_factory=date.today)
    end_date: Optional[date] = None

    @model_validator(mode="after")
    def _end_after_start(self):
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        return self


class GoalUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    goal_description: Optional[str] = Field(default=None, max_length=255)
    target_value: Optional[Decimal] = Field(default=None, gt=0, le=100000, decimal_places=2)
    baseline_value: Optional[Decimal] = Field(default=None, gt=0, le=100000, decimal_places=2)
    manual_percentage: Optional[Decimal] = Field(default=None, ge=0, le=100, decimal_places=2)
    unit: Optional[str] = Field(default=None, max_length=50)
    end_date: Optional[date] = None
    status: Optional[GoalStatusLiteral] = None


class GoalProgressCreate(BaseModel):
    progress_date: date = Field(default_factory=date.today)
    progress_value: Optional[Decimal] = Field(default=None, ge=0, le=100000, decimal_places=2)
    percentage_complete: Optional[Decimal] = Field(default=None, ge=0, le=100, decimal_places=2)
    notes: Optional[str] = Field(default=None, max_length=1000)


class GoalProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    goal_id: int
    progress_date: date
    progress_value: Optional[Decimal] = None
    percentage_complete: Optional[Decimal] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    goal_type: str
    goal_description: Optional[str] = None
    target_value: Optional[Decimal] = None
    baseline_value: Optional[Decimal] = None
    manual_percentage: Optional[Decimal] = None
    unit: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    is_achieved: bool
    status: str
    current_value: Optional[float] = None
    percentage_complete: Optional[float] = None
    progress_note: Optional[str] = None


# ---------------------------------------------------------------------------
# Wearable Ingestion & Sync (W1)
# ---------------------------------------------------------------------------

WearableSourceLiteral = Literal["apple_health", "google_fit", "fitbit", "manual"]


class WearableExerciseSyncItem(BaseModel):
    exercise_date: date
    exercise_type: str = Field(min_length=1, max_length=100)
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    intensity: IntensityLiteral = "MODERATE"
    calories_burned: Optional[int] = Field(default=None, ge=0, le=10000)
    distance_km: Optional[Decimal] = Field(default=None, ge=0, le=500, decimal_places=2)
    notes: Optional[str] = Field(default=None, max_length=1000)


class WearableSleepSyncItem(BaseModel):
    sleep_date: date
    bedtime: Optional[time] = None
    wake_time: Optional[time] = None
    duration_hours: Optional[Decimal] = Field(default=None, ge=0, le=24, decimal_places=2)
    sleep_quality: Optional[int] = Field(default=None, ge=1, le=10)
    interruptions: Optional[int] = Field(default=None, ge=0, le=50)
    deep_sleep_hours: Optional[Decimal] = Field(default=None, ge=0, le=24, decimal_places=2)
    notes: Optional[str] = Field(default=None, max_length=1000)


class WearableSyncIn(BaseModel):
    source: WearableSourceLiteral = "apple_health"
    exercises: list[WearableExerciseSyncItem] = Field(default_factory=list)
    sleeps: list[WearableSleepSyncItem] = Field(default_factory=list)


class WearableSyncOut(BaseModel):
    source: str
    exercises_synced: int
    sleeps_synced: int
    message: str


class WearableSimulatedDeleteOut(BaseModel):
    status: str
    deleted_exercises: int
    deleted_sleeps: int
    message: str


# ---------------------------------------------------------------------------
# Dynamic Goal Recommendations (W2)
# ---------------------------------------------------------------------------

class GoalRecommendationItem(BaseModel):
    goal_type: GoalTypeLiteral
    goal_description: str
    target_value: Decimal
    unit: str
    rationale: str
    category: str  # e.g., "activity", "recovery", "adherence", "nutrition"
    difficulty: str  # "starter", "moderate", "challenge"


class GoalRecommendationsOut(BaseModel):
    recommendations: list[GoalRecommendationItem]
    user_context: dict


# ---------------------------------------------------------------------------
# Multi-Factor Wellness Correlation Engine (W3)
# ---------------------------------------------------------------------------

class CorrelationMetric(BaseModel):
    pair_name: str  # e.g., "Exercise vs Sleep Quality"
    factor_a: str
    factor_b: str
    sample_size_days: int
    has_sufficient_data: bool  # >= 5 days
    correlation_coefficient: Optional[float] = None  # Pearson's r [-1.0, 1.0]
    direction: Optional[str] = None  # "positive", "negative", "neutral"
    insight_summary: str
    actionable_tip: Optional[str] = None


class WellnessCorrelationsOut(BaseModel):
    correlations: list[CorrelationMetric]
    evaluation_window_days: int
    message: str

