"""Wellness goal CRUD, with live metric computation and historical snapshot logging."""

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.middleware.profile_scope import ProfileScope
from app.models import GoalProgress, User, WellnessGoal
from app.schemas.tracking import GoalCreate, GoalProgressCreate, GoalUpdate
from app.services import medicine_service, tracking_service
from app.utils.goal_progress import compute_progress

NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")

# Fixed, documented evaluation windows - goal.unit is a free-text display label (e.g.
# "minutes/week"), not parsed, so the window a goal_type is measured over is fixed here
# regardless of what the user typed as the unit.
EXERCISE_WINDOW_DAYS = 7
SLEEP_WINDOW_DAYS = 7
ADHERENCE_WINDOW_DAYS = 30


def _get_scope_ids(db: Session, target: User | ProfileScope) -> tuple[int, int]:
    if isinstance(target, ProfileScope):
        return target.owner_id, target.profile_id
    from app.services.care_profile_service import get_or_create_primary_profile
    primary = get_or_create_primary_profile(db, target)
    return target.id, primary.id


def _current_metric(db: Session, target: User | ProfileScope, goal_type: str):
    if goal_type == "EXERCISE":
        return tracking_service.total_exercise_minutes(db, target, EXERCISE_WINDOW_DAYS)
    if goal_type == "SLEEP":
        return tracking_service.average_sleep_hours(db, target, SLEEP_WINDOW_DAYS)
    if goal_type == "HYDRATION":
        # 0ml logged today is a real, valid value (not "no data") - unlike e.g. adherence,
        # where 0 scheduled doses is ambiguous, a day with nothing logged yet genuinely means 0ml.
        return float(tracking_service.hydration_daily_total(db, target, date.today()))
    if goal_type == "MEDICINE_ADHERENCE":
        return medicine_service.get_overall_adherence(db, target, ADHERENCE_WINDOW_DAYS)
    if goal_type == "WEIGHT":
        user = target.caller_user if isinstance(target, ProfileScope) else target
        w = user.profile.weight_kg if user.profile else None
        return float(w) if w is not None else None
    return None  # OTHER


def _upsert_daily_progress_snapshot(db: Session, goal: WellnessGoal, current_value: Optional[float], percentage: float) -> None:
    today = date.today()
    row = db.scalar(select(GoalProgress).where(
        GoalProgress.goal_id == goal.id, GoalProgress.progress_date == today
    ))
    if row is None:
        row = GoalProgress(goal_id=goal.id, progress_date=today)
        db.add(row)
    row.progress_value = Decimal(str(current_value)) if current_value is not None else None
    row.percentage_complete = Decimal(str(percentage))
    db.commit()


def _attach_progress(db: Session, target: User | ProfileScope, goal: WellnessGoal, persist_snapshot: bool = False) -> WellnessGoal:
    metric = _current_metric(db, target, goal.goal_type)
    target_val = float(goal.target_value) if goal.target_value is not None else None
    baseline = float(goal.baseline_value) if goal.baseline_value is not None else None
    manual_pct = float(goal.manual_percentage) if goal.manual_percentage is not None else None
    result = compute_progress(goal.goal_type, target_val, metric, baseline_value=baseline, manual_percentage=manual_pct)
    goal.current_value = result.current_value
    goal.percentage_complete = result.percentage_complete
    goal.progress_note = result.note

    if persist_snapshot and result.percentage_complete is not None:
        _upsert_daily_progress_snapshot(db, goal, result.current_value, result.percentage_complete)

    return goal


def create_goal(db: Session, target: User | ProfileScope, data: GoalCreate) -> WellnessGoal:
    owner_id, profile_id = _get_scope_ids(db, target)
    goal_data = data.model_dump()
    user = target.caller_user if isinstance(target, ProfileScope) else target
    if goal_data.get("goal_type") == "WEIGHT" and not goal_data.get("baseline_value"):
        if user.profile and user.profile.weight_kg is not None:
            goal_data["baseline_value"] = user.profile.weight_kg

    goal = WellnessGoal(user_id=owner_id, care_profile_id=profile_id, **goal_data)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _attach_progress(db, target, goal, persist_snapshot=True)


def list_goals(db: Session, target: User | ProfileScope, status_filter: str | None = None) -> list[WellnessGoal]:
    owner_id, profile_id = _get_scope_ids(db, target)
    stmt = select(WellnessGoal).where(
        WellnessGoal.user_id == owner_id,
        WellnessGoal.care_profile_id == profile_id,
    )
    if status_filter:
        stmt = stmt.where(WellnessGoal.status == status_filter)
    goals = list(db.scalars(stmt.order_by(WellnessGoal.created_at.desc())).all())
    return [_attach_progress(db, target, g) for g in goals]


def get_goal(db: Session, target: User | ProfileScope, goal_id: int) -> WellnessGoal:
    owner_id, profile_id = _get_scope_ids(db, target)
    goal = db.scalar(
        select(WellnessGoal).where(
            WellnessGoal.id == goal_id,
            WellnessGoal.user_id == owner_id,
            WellnessGoal.care_profile_id == profile_id,
        )
    )
    if goal is None:
        raise NOT_FOUND
    return _attach_progress(db, target, goal)


def update_goal(db: Session, target: User | ProfileScope, goal_id: int, data: GoalUpdate) -> WellnessGoal:
    owner_id, profile_id = _get_scope_ids(db, target)
    goal = db.scalar(
        select(WellnessGoal).where(
            WellnessGoal.id == goal_id,
            WellnessGoal.user_id == owner_id,
            WellnessGoal.care_profile_id == profile_id,
        )
    )
    if goal is None:
        raise NOT_FOUND
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(goal, field, value)
    if changes.get("status") == "COMPLETED":
        goal.is_achieved = True
    db.commit()
    db.refresh(goal)
    return _attach_progress(db, target, goal, persist_snapshot=True)


def delete_goal(db: Session, target: User | ProfileScope, goal_id: int) -> None:
    owner_id, profile_id = _get_scope_ids(db, target)
    goal = db.scalar(
        select(WellnessGoal).where(
            WellnessGoal.id == goal_id,
            WellnessGoal.user_id == owner_id,
            WellnessGoal.care_profile_id == profile_id,
        )
    )
    if goal is None:
        raise NOT_FOUND
    db.delete(goal)
    db.commit()


def log_progress(db: Session, target: User | ProfileScope, goal_id: int, data: GoalProgressCreate) -> GoalProgress:
    goal = get_goal(db, target, goal_id)
    progress = GoalProgress(
        goal_id=goal.id,
        progress_date=data.progress_date,
        progress_value=data.progress_value,
        percentage_complete=data.percentage_complete,
        notes=data.notes,
    )
    if data.percentage_complete is not None and goal.goal_type == "OTHER":
        goal.manual_percentage = data.percentage_complete
    db.add(progress)
    db.commit()
    db.refresh(progress)
    return progress


def list_goal_progress(db: Session, target: User | ProfileScope, goal_id: int) -> list[GoalProgress]:
    goal = get_goal(db, target, goal_id)
    rows = db.scalars(
        select(GoalProgress)
        .where(GoalProgress.goal_id == goal.id)
        .order_by(GoalProgress.progress_date.desc(), GoalProgress.id.desc())
    ).all()
    return list(rows)


# ---------------------------------------------------------------------------
# Dynamic Personalized Goal Recommendations (W2)
# ---------------------------------------------------------------------------

def get_recommended_goals(db: Session, target: User | ProfileScope) -> dict:
    from app.models.health import HealthAssessment
    from app.models.medicine import Medicine
    from app.schemas.tracking import GoalRecommendationItem, GoalRecommendationsOut

    owner_id, profile_id = _get_scope_ids(db, target)
    user = target.caller_user if isinstance(target, ProfileScope) else target

    # 1. Fetch current exercise baseline
    weekly_exercise = tracking_service.total_exercise_minutes(db, target, 7) or 0
    avg_sleep = tracking_service.average_sleep_hours(db, target, 7) or 0.0

    # 2. Check latest assessment / risk score
    latest_assessment = db.scalar(
        select(HealthAssessment)
        .where(HealthAssessment.user_id == owner_id)
        .order_by(HealthAssessment.created_at.desc())
    )
    risk_level = "LOW"
    risk_score = 0.0
    if latest_assessment:
        risk_score = float(latest_assessment.health_score or 0)
        risk_level = latest_assessment.risk_category or "LOW"

    # 3. Check active medicines
    med_count = db.scalar(
        select(func.count(Medicine.id))
        .where(Medicine.user_id == owner_id, Medicine.is_active.is_(True))
    ) or 0

    recommendations: list[dict] = []

    # Exercise recommendation
    if weekly_exercise < 60:
        recommendations.append({
            "goal_type": "EXERCISE",
            "goal_description": "Kickstart Daily Movement (150 min/wk)",
            "target_value": Decimal("150.0"),
            "unit": "minutes/week",
            "rationale": "AHA & WHO guidelines recommend at least 150 minutes of moderate activity weekly to reduce cardiovascular and metabolic risk.",
            "category": "activity",
            "difficulty": "starter",
        })
    elif weekly_exercise < 150:
        recommendations.append({
            "goal_type": "EXERCISE",
            "goal_description": "Achieve WHO Aerobic Target (150 min/wk)",
            "target_value": Decimal("150.0"),
            "unit": "minutes/week",
            "rationale": f"You are currently at {weekly_exercise} mins/wk. Progressively bridging to 150 minutes provides optimal cardiometabolic protection.",
            "category": "activity",
            "difficulty": "moderate",
        })
    else:
        recommendations.append({
            "goal_type": "EXERCISE",
            "goal_description": "Advanced Endurance & Conditioning (220 min/wk)",
            "target_value": Decimal("220.0"),
            "unit": "minutes/week",
            "rationale": "You're already exceeding baseline targets! Progressing to 220+ mins builds VO2 max and insulin sensitivity.",
            "category": "activity",
            "difficulty": "challenge",
        })

    # Sleep recommendation
    if avg_sleep < 7.0:
        recommendations.append({
            "goal_type": "SLEEP",
            "goal_description": "Restore Optimal Recovery Sleep (7.5 hrs/night)",
            "target_value": Decimal("7.5"),
            "unit": "hours/night",
            "rationale": "Consistent 7-8 hours of sleep stabilizes blood pressure, lowers cortisol, and supports cognitive restoration.",
            "category": "recovery",
            "difficulty": "starter" if avg_sleep < 6.0 else "moderate",
        })
    else:
        recommendations.append({
            "goal_type": "SLEEP",
            "goal_description": "Sustain Healthy Circadian Sleep (8.0 hrs/night)",
            "target_value": Decimal("8.0"),
            "unit": "hours/night",
            "rationale": "Maintain your restorative sleep foundation with consistent bedtimes and deep sleep hygiene.",
            "category": "recovery",
            "difficulty": "starter",
        })

    # Hydration recommendation
    recommendations.append({
        "goal_type": "HYDRATION",
        "goal_description": "Target Daily Optimal Hydration (2,500 mL)",
        "target_value": Decimal("2500.0"),
        "unit": "mL/day",
        "rationale": "Sufficient hydration enhances kidney function, cellular transport, and minimizes daytime fatigue.",
        "category": "nutrition",
        "difficulty": "starter",
    })

    # Medicine adherence recommendation if user takes medicines
    if med_count > 0:
        recommendations.append({
            "goal_type": "MEDICINE_ADHERENCE",
            "goal_description": "Perfect Medication Adherence (95%+)",
            "target_value": Decimal("95.0"),
            "unit": "% adherence",
            "rationale": f"You currently have {med_count} active prescription(s). Achieving >=95% adherence ensures consistent therapeutic efficacy.",
            "category": "adherence",
            "difficulty": "moderate",
        })

    # Weight management recommendation if overweight or high risk
    if user.profile and user.profile.weight_kg and user.profile.height_cm:
        h_m = float(user.profile.height_cm) / 100.0
        w_kg = float(user.profile.weight_kg)
        bmi = w_kg / (h_m * h_m)
        if bmi > 25.0:
            target_wt = round(w_kg * 0.95, 1)  # 5% reduction goal
            recommendations.append({
                "goal_type": "WEIGHT",
                "goal_description": f"Gradual 5% Health Weight Target ({target_wt} kg)",
                "target_value": Decimal(str(target_wt)),
                "unit": "kg",
                "rationale": "Clinical trials show a modest 5% body weight reduction markedly improves glycemic control and lipid profiles.",
                "category": "nutrition",
                "difficulty": "moderate",
            })

    return {
        "recommendations": recommendations,
        "user_context": {
            "current_weekly_exercise_mins": weekly_exercise,
            "current_avg_sleep_hours": round(avg_sleep, 1),
            "active_medications_count": med_count,
            "risk_level": risk_level,
            "risk_score": risk_score,
        }
    }

