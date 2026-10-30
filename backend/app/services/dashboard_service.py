"""Assembles the single dashboard payload the frontend needs in one request, from data each
owning service already exposes - no new business logic, just composition.
"""

from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.middleware.profile_scope import ProfileScope
from app.models import CareProfile, User
from app.services import goal_service, health_service, medicine_service, tracking_service, report_service
from app.utils.wellness_insights import generate_insights


def get_dashboard(db: Session, target: User | ProfileScope) -> dict:
    latest_assessment = health_service.get_latest_assessment(db, target)
    today_medicines = medicine_service.get_today_schedule(db, target)
    hydration_today = tracking_service.hydration_daily_summary(db, target)
    exercise_week = tracking_service.exercise_weekly_summary(db, target)
    sleep_week = tracking_service.sleep_weekly_summary(db, target)
    goals = goal_service.list_goals(db, target, status_filter="ACTIVE")

    this_week_start = report_service.monday_of(date.today())
    last_week_start = this_week_start - timedelta(days=7)
    this_week = report_service.week_metrics(db, target, this_week_start, this_week_start + timedelta(days=6))
    last_week = report_service.week_metrics(db, target, last_week_start, this_week_start - timedelta(days=1))
    insight_current = {
        "exercise_minutes": this_week["total_exercise_minutes"], "sleep_hours": this_week["average_sleep_duration"],
        "hydration_ml": this_week["average_hydration_ml"], "medicine_adherence_percent": this_week["medicine_adherence_percent"],
        "health_score": this_week["average_health_score"],
    }
    insight_previous = {
        "exercise_minutes": last_week["total_exercise_minutes"], "sleep_hours": last_week["average_sleep_duration"],
        "hydration_ml": last_week["average_hydration_ml"], "medicine_adherence_percent": last_week["medicine_adherence_percent"],
        "health_score": last_week["average_health_score"],
    }
    active_baseline = None
    if any(insight_previous.get(k) in (0, None) and (insight_current.get(k) or 0) > 0 for k in insight_current):
        prior_start = this_week_start - timedelta(days=28)
        prior_4w = report_service.week_metrics(db, target, prior_start, this_week_start - timedelta(days=1))
        active_baseline = {
            "exercise_minutes": round(prior_4w["total_exercise_minutes"] / 4, 1) if (prior_4w.get("total_exercise_minutes") or 0) > 0 else None,
            "sleep_hours": prior_4w.get("average_sleep_duration"),
            "hydration_ml": prior_4w.get("average_hydration_ml"),
            "medicine_adherence_percent": prior_4w.get("medicine_adherence_percent"),
            "health_score": prior_4w.get("average_health_score"),
        }
    insights = generate_insights(insight_current, insight_previous, active_baseline=active_baseline)

    user = target.caller_user if isinstance(target, ProfileScope) else target
    profile = target.profile if isinstance(target, ProfileScope) else None
    profile_name = profile.full_name if profile else user.full_name
    is_primary = profile.is_primary if profile else True

    return {
        "latest_assessment": health_service.to_out_dict(latest_assessment, target.caller_user if isinstance(target, ProfileScope) else target, is_primary=is_primary) if latest_assessment else None,
        "today_medicines": today_medicines,
        "hydration_today": hydration_today,
        "exercise_this_week": exercise_week,
        "sleep_this_week": sleep_week,
        "active_goals": goals,
        "insights": [{"metric": i.metric, "direction": i.direction, "message": i.message} for i in insights],
        "profile_name": profile_name,
        "is_primary_profile": is_primary,
    }
