"""Multi-Factor Wellness Correlation Engine (W3).

Calculates empirical statistical correlations across tracked health vectors:
1. Sleep Duration vs Medication Adherence (Pearson r & daily pairing)
2. Exercise Duration vs Sleep Quality (Pearson r & daily pairing)
3. Exercise Duration vs Symptom Count / Severity (Pearson r & daily pairing)

Requirements:
- Minimum 5 overlapping days of data to compute Pearson's r.
- Clear, honest messaging when sample size is insufficient (< 5 days).
- Scoped to user and active care profile.
"""

from datetime import date, timedelta
import math
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.middleware.profile_scope import ProfileScope
from app.models.emergency_and_symptoms import SymptomLog
from app.models.medicine import Medicine, MedicineSchedule
from app.models.tracking import ExerciseLog, SleepLog
from app.models.user import User


def _get_scope_ids(db: Session, target: User | ProfileScope) -> tuple[int, Optional[int], bool]:
    if isinstance(target, ProfileScope):
        return target.owner_id, target.profile_id, target.profile.is_primary
    from app.services.care_profile_service import get_or_create_primary_profile
    primary = get_or_create_primary_profile(db, target)
    return target.id, primary.id, primary.is_primary


def _profile_filter(model_cls, profile_id: Optional[int], is_primary: bool):
    if is_primary:
        return (model_cls.care_profile_id == profile_id) | (model_cls.care_profile_id.is_(None))
    return model_cls.care_profile_id == profile_id


def _compute_pearson_r(xs: list[float], ys: list[float]) -> Optional[float]:
    """Compute Pearson correlation coefficient r. Returns None if variance is 0 or len < 2."""
    n = len(xs)
    if n < 2 or len(ys) != n:
        return None

    mean_x = sum(xs) / n
    mean_y = sum(ys) / n

    diff_x = [x - mean_x for x in xs]
    diff_y = [y - mean_y for y in ys]

    sum_xy = sum(dx * dy for dx, dy in zip(diff_x, diff_y))
    sum_xx = sum(dx * dx for dx in diff_x)
    sum_yy = sum(dy * dy for dy in diff_y)

    denominator = math.sqrt(sum_xx * sum_yy)
    if denominator == 0:
        return 0.0  # Zero variance in one or both variables

    r = sum_xy / denominator
    # Clamp for floating point inaccuracy
    return round(max(-1.0, min(1.0, r)), 3)


def compute_correlations(db: Session, target: User | ProfileScope, days: int = 30) -> dict:
    owner_id, profile_id, is_primary = _get_scope_ids(db, target)
    cutoff = date.today() - timedelta(days=days - 1)

    # 1. Fetch daily Sleep logs
    sleep_rows = db.scalars(
        select(SleepLog).where(
            SleepLog.user_id == owner_id,
            _profile_filter(SleepLog, profile_id, is_primary),
            SleepLog.sleep_date >= cutoff,
        )
    ).all()
    sleep_by_date: dict[date, dict] = {}
    for s in sleep_rows:
        sleep_by_date[s.sleep_date] = {
            "duration": float(s.sleep_duration_hours) if s.sleep_duration_hours is not None else None,
            "quality": s.sleep_quality,
        }

    # 2. Fetch daily Exercise logs (sum duration per date)
    exercise_rows = db.scalars(
        select(ExerciseLog).where(
            ExerciseLog.user_id == owner_id,
            _profile_filter(ExerciseLog, profile_id, is_primary),
            ExerciseLog.exercise_date >= cutoff,
        )
    ).all()
    exercise_by_date: dict[date, float] = {}
    for e in exercise_rows:
        d = e.exercise_date
        mins = float(e.duration_minutes or 0)
        exercise_by_date[d] = exercise_by_date.get(d, 0.0) + mins

    # 3. Fetch daily Medicine adherence (taken vs total scheduled per date)
    med_schedules = db.scalars(
        select(MedicineSchedule)
        .join(Medicine, MedicineSchedule.medicine_id == Medicine.id)
        .where(
            Medicine.user_id == owner_id,
            _profile_filter(Medicine, profile_id, is_primary),
            MedicineSchedule.scheduled_date >= cutoff,
        )
    ).all()
    med_by_date: dict[date, dict] = {}
    for m in med_schedules:
        d = m.scheduled_date
        if d not in med_by_date:
            med_by_date[d] = {"taken": 0, "total": 0}
        med_by_date[d]["total"] += 1
        if m.is_taken:
            med_by_date[d]["taken"] += 1

    # 4. Fetch daily Symptoms (count & average severity per date)
    symptom_rows = db.scalars(
        select(SymptomLog).where(
            SymptomLog.user_id == owner_id,
            _profile_filter(SymptomLog, profile_id, is_primary),
            SymptomLog.logged_at >= cutoff,
        )
    ).all()
    symptom_by_date: dict[date, list[int]] = {}
    for s in symptom_rows:
        d = s.logged_at.date() if hasattr(s.logged_at, "date") else s.logged_at
        if d not in symptom_by_date:
            symptom_by_date[d] = []
        if s.severity is not None:
            symptom_by_date[d].append(int(s.severity))

    correlations = []

    # --- Pair 1: Exercise Duration vs Sleep Quality ---
    pair1_dates = [d for d in sleep_by_date if d in exercise_by_date and sleep_by_date[d]["quality"] is not None]
    n1 = len(pair1_dates)
    if n1 >= 5:
        xs = [exercise_by_date[d] for d in pair1_dates]
        ys = [float(sleep_by_date[d]["quality"]) for d in pair1_dates]
        r1 = _compute_pearson_r(xs, ys)
        direction = "positive" if r1 and r1 > 0.2 else ("negative" if r1 and r1 < -0.2 else "neutral")
        tip = "Try maintaining 30+ minutes of daytime movement to support deeper, uninterrupted sleep."
        if direction == "positive":
            summary = f"Strong positive link (r = {r1:+.2f}). Days with greater exercise are associated with higher self-rated sleep quality."
        elif direction == "negative":
            summary = f"Negative trend (r = {r1:+.2f}). Late-night or high-intensity workouts might be interfering with your sleep onset."
        else:
            summary = f"Neutral correlation (r = {r1:+.2f}). Exercise and sleep quality fluctuate relatively independently."
        correlations.append({
            "pair_name": "Exercise vs Sleep Quality",
            "factor_a": "Daily Exercise Minutes",
            "factor_b": "Sleep Quality (1-10)",
            "sample_size_days": n1,
            "has_sufficient_data": True,
            "correlation_coefficient": r1,
            "direction": direction,
            "insight_summary": summary,
            "actionable_tip": tip,
        })
    else:
        correlations.append({
            "pair_name": "Exercise vs Sleep Quality",
            "factor_a": "Daily Exercise Minutes",
            "factor_b": "Sleep Quality (1-10)",
            "sample_size_days": n1,
            "has_sufficient_data": False,
            "correlation_coefficient": None,
            "direction": None,
            "insight_summary": f"Need at least 5 paired tracking days to calculate correlation (currently {n1} days logged).",
            "actionable_tip": "Log both daily exercise and night sleep for a few more days to uncover your rhythm.",
        })

    # --- Pair 2: Sleep Duration vs Medication Adherence ---
    pair2_dates = [d for d in sleep_by_date if d in med_by_date and sleep_by_date[d]["duration"] is not None and med_by_date[d]["total"] > 0]
    n2 = len(pair2_dates)
    if n2 >= 5:
        xs = [sleep_by_date[d]["duration"] for d in pair2_dates]
        ys = [(med_by_date[d]["taken"] / med_by_date[d]["total"]) * 100.0 for d in pair2_dates]
        r2 = _compute_pearson_r(xs, ys)
        direction = "positive" if r2 and r2 > 0.2 else ("negative" if r2 and r2 < -0.2 else "neutral")
        if direction == "positive":
            summary = f"Positive link (r = {r2:+.2f}). Days following adequate rest show higher medication adherence."
        else:
            summary = f"Adherence remains stable across different sleep durations (r = {r2:+.2f})."
        correlations.append({
            "pair_name": "Sleep Duration vs Medication Adherence",
            "factor_a": "Sleep Duration (hours)",
            "factor_b": "Medication Adherence (%)",
            "sample_size_days": n2,
            "has_sufficient_data": True,
            "correlation_coefficient": r2,
            "direction": direction,
            "insight_summary": summary,
            "actionable_tip": "Consistent wake times and morning alarm routines help safeguard pill-taking consistency.",
        })
    else:
        correlations.append({
            "pair_name": "Sleep Duration vs Medication Adherence",
            "factor_a": "Sleep Duration (hours)",
            "factor_b": "Medication Adherence (%)",
            "sample_size_days": n2,
            "has_sufficient_data": False,
            "correlation_coefficient": None,
            "direction": None,
            "insight_summary": f"Need at least 5 overlapping days of sleep and medication logs (currently {n2} days).",
            "actionable_tip": "Log your daily doses and nightly sleep to observe how rest impacts your routine.",
        })

    # --- Pair 3: Exercise Duration vs Symptom Severity ---
    pair3_dates = [d for d in exercise_by_date if d in symptom_by_date and symptom_by_date[d]]
    n3 = len(pair3_dates)
    if n3 >= 5:
        xs = [exercise_by_date[d] for d in pair3_dates]
        ys = [sum(symptom_by_date[d]) / len(symptom_by_date[d]) for d in pair3_dates]
        r3 = _compute_pearson_r(xs, ys)
        direction = "positive" if r3 and r3 > 0.2 else ("negative" if r3 and r3 < -0.2 else "neutral")
        if direction == "negative":
            summary = f"Favorable trend (r = {r3:+.2f}). Days with physical activity coincide with reduced symptom severity."
        elif direction == "positive":
            summary = f"Cautionary trend (r = {r3:+.2f}). Higher activity days show elevated symptom reporting. Check with your physician on exercise tolerance."
        else:
            summary = f"Neutral association (r = {r3:+.2f}) between exercise duration and reported symptoms."
        correlations.append({
            "pair_name": "Exercise vs Symptom Severity",
            "factor_a": "Daily Exercise Minutes",
            "factor_b": "Average Symptom Severity (1-10)",
            "sample_size_days": n3,
            "has_sufficient_data": True,
            "correlation_coefficient": r3,
            "direction": direction,
            "insight_summary": summary,
            "actionable_tip": "Stay within comfortable heart-rate zones and stay well hydrated when managing symptoms.",
        })
    else:
        correlations.append({
            "pair_name": "Exercise vs Symptom Severity",
            "factor_a": "Daily Exercise Minutes",
            "factor_b": "Average Symptom Severity (1-10)",
            "sample_size_days": n3,
            "has_sufficient_data": False,
            "correlation_coefficient": None,
            "direction": None,
            "insight_summary": f"Need at least 5 overlapping days of exercise and symptom entries (currently {n3} days).",
            "actionable_tip": "Continue logging exercises and symptoms to assess physical tolerance patterns.",
        })

    return {
        "correlations": correlations,
        "evaluation_window_days": days,
        "message": f"Evaluated cross-factor wellness data across past {days} days."
    }
