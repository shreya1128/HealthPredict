"""Dashboard and weekly report response schemas."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.health import AssessmentOut
from app.schemas.medicine import ScheduleEntryOut
from app.schemas.tracking import (
    ExerciseWeeklySummary, GoalOut, HydrationDailySummary, SleepWeeklySummary,
)


class InsightOut(BaseModel):
    metric: str
    direction: str
    message: str


class DashboardOut(BaseModel):
    profile_name: Optional[str] = None
    is_primary_profile: Optional[bool] = None
    latest_assessment: Optional[AssessmentOut] = None
    today_medicines: list[ScheduleEntryOut]
    hydration_today: HydrationDailySummary
    exercise_this_week: ExerciseWeeklySummary
    sleep_this_week: SleepWeeklySummary
    active_goals: list[GoalOut]
    insights: list[InsightOut]


class WeeklyReportOut(BaseModel):
    id: Optional[int] = None
    profile_name: Optional[str] = None
    week_start_date: date
    week_end_date: date
    average_health_score: Optional[float] = None
    weight_change_kg: Optional[float] = None
    total_exercise_minutes: Optional[int] = None
    average_sleep_duration: Optional[float] = None
    average_hydration_ml: Optional[float] = None
    medicine_adherence_percent: Optional[float] = None
    goals_progress_percent: Optional[float] = None
    significant_changes: list[InsightOut]
    recommendations: list[str]


class WeeklyReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    week_start_date: date
    week_end_date: date
    average_health_score: Optional[Decimal] = None
    medicine_adherence_percent: Optional[Decimal] = None
    created_at: Optional[datetime] = None
