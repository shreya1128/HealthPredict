"""Exercise, sleep, hydration, and nutrition tracking: CRUD plus the daily/weekly summaries
each page needs. No cross-type logic here - that's goal_service.py's job.
"""

from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.middleware.profile_scope import ProfileScope
from app.models import ExerciseLog, HydrationLog, NutritionLog, SleepLog, User
from app.schemas.tracking import ExerciseCreate, HydrationCreate, NutritionCreate, SleepCreate
from app.utils.sleep_duration import compute_duration_hours

NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")


def _get_scope_ids(db: Session, target: User | ProfileScope) -> tuple[int, int, bool]:
    if isinstance(target, ProfileScope):
        return target.owner_id, target.profile_id, target.profile.is_primary
    from app.services.care_profile_service import get_or_create_primary_profile
    primary = get_or_create_primary_profile(db, target)
    return target.id, primary.id, primary.is_primary


def _profile_filter(model, profile_id: int, is_primary: bool):
    return or_(model.care_profile_id == profile_id, model.care_profile_id.is_(None)) if is_primary else (model.care_profile_id == profile_id)


def _owned_or_404(db: Session, model, target: User | ProfileScope, entry_id: int):
    owner_id, profile_id, is_primary = _get_scope_ids(db, target)
    row = db.scalar(
        select(model).where(
            model.id == entry_id,
            model.user_id == owner_id,
            _profile_filter(model, profile_id, is_primary),
        )
    )
    if row is None:
        raise NOT_FOUND
    return row


# ---------------------------------------------------------------------------
# Exercise
# ---------------------------------------------------------------------------

def create_exercise(db: Session, target: User | ProfileScope, data: ExerciseCreate) -> ExerciseLog:
    owner_id, profile_id, _ = _get_scope_ids(db, target)
    row = ExerciseLog(user_id=owner_id, care_profile_id=profile_id, **data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_exercise(db: Session, target: User | ProfileScope, days: int) -> list[ExerciseLog]:
    owner_id, profile_id, is_primary = _get_scope_ids(db, target)
    cutoff = date.today() - timedelta(days=days - 1)
    return list(db.scalars(select(ExerciseLog).where(
        ExerciseLog.user_id == owner_id,
        _profile_filter(ExerciseLog, profile_id, is_primary),
        ExerciseLog.exercise_date >= cutoff
    ).order_by(ExerciseLog.exercise_date.desc(), ExerciseLog.id.desc())).all())


def delete_exercise(db: Session, target: User | ProfileScope, entry_id: int) -> None:
    row = _owned_or_404(db, ExerciseLog, target, entry_id)
    db.delete(row)
    db.commit()


def exercise_weekly_summary(db: Session, target: User | ProfileScope, days: int = 7) -> dict:
    rows = list_exercise(db, target, days)
    by_day: dict[str, int] = {}
    for r in rows:
        key = r.exercise_date.isoformat()
        by_day[key] = by_day.get(key, 0) + (r.duration_minutes or 0)
    return {
        "days": days, "total_minutes": sum(r.duration_minutes or 0 for r in rows),
        "total_calories": sum(r.calories_burned or 0 for r in rows), "by_day": by_day,
    }


def total_exercise_minutes(db: Session, target: User | ProfileScope, days: int) -> Optional[float]:
    rows = list_exercise(db, target, days)
    if not rows:
        return None
    return float(sum(r.duration_minutes or 0 for r in rows))


# ---------------------------------------------------------------------------
# Sleep
# ---------------------------------------------------------------------------

def create_sleep(db: Session, target: User | ProfileScope, data: SleepCreate) -> SleepLog:
    owner_id, profile_id, _ = _get_scope_ids(db, target)
    fields = data.model_dump()
    duration = None
    if data.bedtime and data.wake_time:
        duration = compute_duration_hours(data.bedtime, data.wake_time)
    row = SleepLog(user_id=owner_id, care_profile_id=profile_id, sleep_duration_hours=duration, **fields)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_sleep(db: Session, target: User | ProfileScope, days: int) -> list[SleepLog]:
    owner_id, profile_id, is_primary = _get_scope_ids(db, target)
    cutoff = date.today() - timedelta(days=days - 1)
    return list(db.scalars(select(SleepLog).where(
        SleepLog.user_id == owner_id,
        _profile_filter(SleepLog, profile_id, is_primary),
        SleepLog.sleep_date >= cutoff
    ).order_by(SleepLog.sleep_date.desc(), SleepLog.id.desc())).all())


def delete_sleep(db: Session, target: User | ProfileScope, entry_id: int) -> None:
    row = _owned_or_404(db, SleepLog, target, entry_id)
    db.delete(row)
    db.commit()


def sleep_weekly_summary(db: Session, target: User | ProfileScope, days: int = 7) -> dict:
    rows = list_sleep(db, target, days)
    durations = [float(r.sleep_duration_hours) for r in rows if r.sleep_duration_hours is not None]
    qualities = [r.sleep_quality for r in rows if r.sleep_quality is not None]
    by_day = {r.sleep_date.isoformat(): (float(r.sleep_duration_hours) if r.sleep_duration_hours is not None else None)
             for r in rows}
    return {
        "days": days,
        "average_duration_hours": round(sum(durations) / len(durations), 2) if durations else None,
        "average_quality": round(sum(qualities) / len(qualities), 2) if qualities else None,
        "by_day": by_day,
    }


def average_sleep_hours(db: Session, target: User | ProfileScope, days: int) -> Optional[float]:
    return sleep_weekly_summary(db, target, days)["average_duration_hours"]


# ---------------------------------------------------------------------------
# Hydration
# ---------------------------------------------------------------------------

def create_hydration(db: Session, target: User | ProfileScope, data: HydrationCreate) -> HydrationLog:
    owner_id, profile_id, _ = _get_scope_ids(db, target)
    row = HydrationLog(user_id=owner_id, care_profile_id=profile_id, **data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_hydration(db: Session, target: User | ProfileScope, days: int) -> list[HydrationLog]:
    owner_id, profile_id, is_primary = _get_scope_ids(db, target)
    cutoff = date.today() - timedelta(days=days - 1)
    return list(db.scalars(select(HydrationLog).where(
        HydrationLog.user_id == owner_id,
        _profile_filter(HydrationLog, profile_id, is_primary),
        HydrationLog.hydration_date >= cutoff
    ).order_by(HydrationLog.hydration_date.desc(), HydrationLog.id.desc())).all())


def delete_hydration(db: Session, target: User | ProfileScope, entry_id: int) -> None:
    row = _owned_or_404(db, HydrationLog, target, entry_id)
    db.delete(row)
    db.commit()


def hydration_daily_total(db: Session, target: User | ProfileScope, for_date: date) -> int:
    owner_id, profile_id, is_primary = _get_scope_ids(db, target)
    rows = db.scalars(select(HydrationLog).where(
        HydrationLog.user_id == owner_id,
        _profile_filter(HydrationLog, profile_id, is_primary),
        HydrationLog.hydration_date == for_date
    )).all()
    return sum(r.water_intake_ml for r in rows)


def hydration_daily_summary(db: Session, target: User | ProfileScope) -> dict:
    owner_id, profile_id, _ = _get_scope_ids(db, target)
    today = date.today()
    total = hydration_daily_total(db, target, today)
    user = target.caller_user if isinstance(target, ProfileScope) else target
    goal = user.profile.water_intake_goal_ml if user.profile else None
    return {
        "date_": today, "total_ml": total, "goal_ml": goal,
        "percent_of_goal": round(total / goal * 100, 1) if goal else None,
    }


# ---------------------------------------------------------------------------
# Nutrition
# ---------------------------------------------------------------------------

def create_nutrition(db: Session, target: User | ProfileScope, data: NutritionCreate) -> NutritionLog:
    owner_id, profile_id, _ = _get_scope_ids(db, target)
    row = NutritionLog(user_id=owner_id, care_profile_id=profile_id, **data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_nutrition(db: Session, target: User | ProfileScope, days: int) -> list[NutritionLog]:
    owner_id, profile_id, is_primary = _get_scope_ids(db, target)
    cutoff = date.today() - timedelta(days=days - 1)
    return list(db.scalars(select(NutritionLog).where(
        NutritionLog.user_id == owner_id,
        _profile_filter(NutritionLog, profile_id, is_primary),
        NutritionLog.nutrition_date >= cutoff
    ).order_by(NutritionLog.nutrition_date.desc(), NutritionLog.id.desc())).all())


def delete_nutrition(db: Session, target: User | ProfileScope, entry_id: int) -> None:
    row = _owned_or_404(db, NutritionLog, target, entry_id)
    db.delete(row)
    db.commit()


def nutrition_daily_summary(db: Session, target: User | ProfileScope) -> dict:
    owner_id, profile_id, is_primary = _get_scope_ids(db, target)
    today = date.today()
    rows = db.scalars(select(NutritionLog).where(
        NutritionLog.user_id == owner_id,
        _profile_filter(NutritionLog, profile_id, is_primary),
        NutritionLog.nutrition_date == today
    ).order_by(NutritionLog.created_at.asc())).all()
    return {
        "date_": today, "total_calories": sum(r.calories or 0 for r in rows),
        "meals_logged": sorted({r.meal_type for r in rows}), "entries": rows,
    }


# ---------------------------------------------------------------------------
# Wearables Batch Sync (W1)
# ---------------------------------------------------------------------------

def sync_wearable_data(db: Session, target: User | ProfileScope, payload: "WearableSyncIn") -> dict:
    from app.schemas.tracking import WearableSyncIn
    owner_id, profile_id, is_primary = _get_scope_ids(db, target)
    source = payload.source or "apple_health"

    exercises_count = 0
    for item in payload.exercises:
        # Check if an exercise on this date with same type and source already exists (idempotent upsert/update)
        existing = db.scalar(select(ExerciseLog).where(
            ExerciseLog.user_id == owner_id,
            _profile_filter(ExerciseLog, profile_id, is_primary),
            ExerciseLog.exercise_date == item.exercise_date,
            ExerciseLog.exercise_type == item.exercise_type,
            ExerciseLog.source == source,
        ))
        if existing:
            existing.duration_minutes = item.duration_minutes
            existing.intensity = item.intensity
            existing.calories_burned = item.calories_burned
            existing.distance_km = item.distance_km
            if item.notes:
                existing.notes = item.notes
        else:
            new_log = ExerciseLog(
                user_id=owner_id,
                care_profile_id=profile_id,
                exercise_date=item.exercise_date,
                exercise_type=item.exercise_type,
                duration_minutes=item.duration_minutes,
                intensity=item.intensity,
                calories_burned=item.calories_burned,
                distance_km=item.distance_km,
                source=source,
                notes=item.notes,
            )
            db.add(new_log)
        exercises_count += 1

    sleeps_count = 0
    for item in payload.sleeps:
        # Check if a sleep log on this date already exists with this source (or same date)
        existing_sleep = db.scalar(select(SleepLog).where(
            SleepLog.user_id == owner_id,
            _profile_filter(SleepLog, profile_id, is_primary),
            SleepLog.sleep_date == item.sleep_date,
            SleepLog.source == source,
        ))
        dur = item.duration_hours
        if dur is None and item.bedtime and item.wake_time:
            dur = compute_duration_hours(item.bedtime, item.wake_time)
        if existing_sleep:
            existing_sleep.bedtime = item.bedtime
            existing_sleep.wake_time = item.wake_time
            existing_sleep.sleep_duration_hours = dur
            existing_sleep.sleep_quality = item.sleep_quality
            if item.notes:
                existing_sleep.notes = item.notes
        else:
            new_sleep = SleepLog(
                user_id=owner_id,
                care_profile_id=profile_id,
                sleep_date=item.sleep_date,
                bedtime=item.bedtime,
                wake_time=item.wake_time,
                sleep_duration_hours=dur,
                sleep_quality=item.sleep_quality,
                source=source,
                notes=item.notes,
            )
            db.add(new_sleep)
        sleeps_count += 1

    db.commit()

    return {
        "source": source,
        "exercises_synced": exercises_count,
        "sleeps_synced": sleeps_count,
        "message": f"Successfully ingested {exercises_count} exercise logs and {sleeps_count} sleep records from {source}."
    }


def delete_simulated_data(db: Session, target: User | ProfileScope) -> dict:
    owner_id, profile_id, is_primary = _get_scope_ids(db, target)

    # Delete exercise records where notes contain [DEMO SIMULATED]
    stmt_ex = (
        delete(ExerciseLog)
        .where(
            ExerciseLog.user_id == owner_id,
            _profile_filter(ExerciseLog, profile_id, is_primary),
            ExerciseLog.notes.like("%[DEMO SIMULATED]%"),
        )
    )
    res_ex = db.execute(stmt_ex)
    deleted_exercises = res_ex.rowcount

    # Delete sleep records where notes contain [DEMO SIMULATED]
    stmt_sl = (
        delete(SleepLog)
        .where(
            SleepLog.user_id == owner_id,
            _profile_filter(SleepLog, profile_id, is_primary),
            SleepLog.notes.like("%[DEMO SIMULATED]%"),
        )
    )
    res_sl = db.execute(stmt_sl)
    deleted_sleeps = res_sl.rowcount

    db.commit()
    return {
        "status": "success",
        "deleted_exercises": deleted_exercises,
        "deleted_sleeps": deleted_sleeps,
        "message": f"Deleted {deleted_exercises} exercise and {deleted_sleeps} sleep simulated records.",
    }

