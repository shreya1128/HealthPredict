from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.profile_scope import ProfileScope, get_profile_scope, require_write_scope
from app.models import User
from app.schemas.tracking import (
    ExerciseCreate, ExerciseOut, ExerciseWeeklySummary, HydrationCreate, HydrationDailySummary,
    HydrationOut, NutritionCreate, NutritionDailySummary, NutritionOut, SleepCreate, SleepOut,
    SleepWeeklySummary, WearableSimulatedDeleteOut, WearableSyncIn, WearableSyncOut, WellnessCorrelationsOut,
)
from app.services import correlation_service, tracking_service

router = APIRouter()

# ---- Exercise ----

@router.post("/exercise", response_model=ExerciseOut, status_code=201)
def create_exercise(
    data: ExerciseCreate,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    return tracking_service.create_exercise(db, scope, data)


@router.get("/exercise", response_model=list[ExerciseOut])
def list_exercise(
    days: int = Query(30, ge=1, le=365),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return tracking_service.list_exercise(db, scope, days)


@router.get("/exercise/weekly", response_model=ExerciseWeeklySummary)
def exercise_weekly(
    days: int = Query(7, ge=1, le=90),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return tracking_service.exercise_weekly_summary(db, scope, days)


@router.delete("/exercise/{entry_id}", status_code=204)
def delete_exercise(
    entry_id: int,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    tracking_service.delete_exercise(db, scope, entry_id)


# ---- Sleep ----

@router.post("/sleep", response_model=SleepOut, status_code=201)
def create_sleep(
    data: SleepCreate,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    return tracking_service.create_sleep(db, scope, data)


@router.get("/sleep", response_model=list[SleepOut])
def list_sleep(
    days: int = Query(30, ge=1, le=365),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return tracking_service.list_sleep(db, scope, days)


@router.get("/sleep/weekly", response_model=SleepWeeklySummary)
def sleep_weekly(
    days: int = Query(7, ge=1, le=90),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return tracking_service.sleep_weekly_summary(db, scope, days)


@router.delete("/sleep/{entry_id}", status_code=204)
def delete_sleep(
    entry_id: int,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    tracking_service.delete_sleep(db, scope, entry_id)


# ---- Hydration ----

@router.post("/hydration", response_model=HydrationOut, status_code=201)
def create_hydration(
    data: HydrationCreate,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    return tracking_service.create_hydration(db, scope, data)


@router.get("/hydration", response_model=list[HydrationOut])
def list_hydration(
    days: int = Query(7, ge=1, le=365),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return tracking_service.list_hydration(db, scope, days)


@router.get("/hydration/daily", response_model=HydrationDailySummary)
def hydration_daily(
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return tracking_service.hydration_daily_summary(db, scope)


@router.delete("/hydration/{entry_id}", status_code=204)
def delete_hydration(
    entry_id: int,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    tracking_service.delete_hydration(db, scope, entry_id)


# ---- Nutrition ----

@router.post("/nutrition", response_model=NutritionOut, status_code=201)
def create_nutrition(
    data: NutritionCreate,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    return tracking_service.create_nutrition(db, scope, data)


@router.get("/nutrition", response_model=list[NutritionOut])
def list_nutrition(
    days: int = Query(7, ge=1, le=365),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return tracking_service.list_nutrition(db, scope, days)


@router.get("/nutrition/daily", response_model=NutritionDailySummary)
def nutrition_daily(
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return tracking_service.nutrition_daily_summary(db, scope)


@router.delete("/nutrition/{entry_id}", status_code=204)
def delete_nutrition(
    entry_id: int,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    tracking_service.delete_nutrition(db, scope, entry_id)


# ---- Wearable Ingestion & Multi-Factor Correlations (W1, W3) ----

@router.post("/wearables/sync", response_model=WearableSyncOut)
def sync_wearables(
    payload: WearableSyncIn,
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    return tracking_service.sync_wearable_data(db, scope, payload)


@router.delete("/wearables/simulated", response_model=WearableSimulatedDeleteOut)
def delete_simulated_wearables(
    scope: ProfileScope = Depends(require_write_scope),
    db: Session = Depends(get_db),
):
    return tracking_service.delete_simulated_data(db, scope)


@router.get("/correlations", response_model=WellnessCorrelationsOut)
def get_wellness_correlations(
    days: int = Query(30, ge=7, le=90),
    scope: ProfileScope = Depends(get_profile_scope),
    db: Session = Depends(get_db),
):
    return correlation_service.compute_correlations(db, scope, days=days)

