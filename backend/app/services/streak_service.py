"""Medication Adherence Streaks and Milestones Service.

Tracks consecutive days of 100% medication adherence and awards milestone badges.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.medicine import Medicine, MedicineSchedule
from app.models.notification import Notification, NotificationType
from app.models.user import User


MILESTONES = [
    {
        "id": "streak_3",
        "name": "Getting Started",
        "days_required": 3,
        "icon": "zap",
        "description": "Logged 100% of medication doses for 3 consecutive days.",
    },
    {
        "id": "streak_7",
        "name": "Week Strong",
        "days_required": 7,
        "icon": "award",
        "description": "Perfect medication adherence for 7 consecutive days.",
    },
    {
        "id": "streak_14",
        "name": "Fortnight Champion",
        "days_required": 14,
        "icon": "shield-check",
        "description": "Two uninterrupted weeks of taking all prescribed medicines.",
    },
    {
        "id": "streak_30",
        "name": "Monthly Master",
        "days_required": 30,
        "icon": "trophy",
        "description": "A full month of flawless medication compliance.",
    },
    {
        "id": "streak_60",
        "name": "Two-Month Titan",
        "days_required": 60,
        "icon": "flame",
        "description": "60 consecutive days of timely medication doses.",
    },
    {
        "id": "streak_90",
        "name": "Quarterly Legend",
        "days_required": 90,
        "icon": "star",
        "description": "90 consecutive days of adhering to your healthcare regimen.",
    },
]


def calculate_adherence_streak(db: Session, user: User, target_date: Optional[date] = None) -> Dict[str, Any]:
    """Calculate the user's current streak, longest streak, and badges."""
    today = target_date or date.today()

    # Check if user has active medicines
    has_active_meds = db.scalar(
        select(func.count(Medicine.id)).where(Medicine.user_id == user.id, Medicine.is_active.is_(True))
    )
    if not has_active_meds:
        return {
            "current_streak_days": 0,
            "longest_streak_days": 0,
            "total_active_days": 0,
            "is_streak_active_today": False,
            "badges": [
                {
                    "id": m["id"],
                    "name": m["name"],
                    "days_required": m["days_required"],
                    "unlocked": False,
                    "unlocked_at": None,
                    "icon": m["icon"],
                    "description": m["description"],
                }
                for m in MILESTONES
            ],
            "next_milestone": 3,
        }

    # Fetch daily dose statistics grouped by scheduled_date
    rows = db.execute(
        select(
            MedicineSchedule.scheduled_date,
            func.count(MedicineSchedule.id).label("total_doses"),
            func.sum(func.if_(MedicineSchedule.is_taken, 1, 0)).label("taken_doses"),
            func.sum(func.if_(MedicineSchedule.is_skipped, 1, 0)).label("skipped_doses"),
        )
        .join(Medicine, Medicine.id == MedicineSchedule.medicine_id)
        .where(
            Medicine.user_id == user.id,
            Medicine.is_active.is_(True),
            MedicineSchedule.scheduled_date <= today,
        )
        .group_by(MedicineSchedule.scheduled_date)
        .order_by(MedicineSchedule.scheduled_date.desc())
    ).all()

    daily_stats = {
        row.scheduled_date: {
            "total": int(row.total_doses or 0),
            "taken": int(row.taken_doses or 0),
            "skipped": int(row.skipped_doses or 0),
        }
        for row in rows
    }

    # Determine if today is 100% completed
    today_stats = daily_stats.get(today)
    is_streak_active_today = False
    if today_stats and today_stats["total"] > 0 and today_stats["taken"] == today_stats["total"]:
        is_streak_active_today = True

    # Calculate current streak:
    # If today is 100%, start counting backwards from today.
    # If today is not yet 100% (pending doses), start from yesterday.
    start_date = today if is_streak_active_today else today - timedelta(days=1)
    current_streak = 0
    curr_date = start_date

    while True:
        stats = daily_stats.get(curr_date)
        if stats and stats["total"] > 0:
            if stats["taken"] == stats["total"]:
                current_streak += 1
                curr_date -= timedelta(days=1)
            else:
                break
        else:
            # No doses scheduled on this day: if we went past the first logged schedule, break
            if rows and curr_date < rows[-1].scheduled_date:
                break
            # Otherwise, check if user had doses before
            break

    # Calculate longest streak across history
    sorted_dates = sorted(daily_stats.keys())
    longest_streak = 0
    temp_streak = 0
    prev_date = None

    for d in sorted_dates:
        stats = daily_stats[d]
        if stats["total"] > 0 and stats["taken"] == stats["total"]:
            if prev_date is None or d == prev_date + timedelta(days=1):
                temp_streak += 1
            else:
                temp_streak = 1
            prev_date = d
            if temp_streak > longest_streak:
                longest_streak = temp_streak
        else:
            temp_streak = 0
            prev_date = None

    longest_streak = max(longest_streak, current_streak)
    total_active_days = sum(1 for s in daily_stats.values() if s["total"] > 0 and s["taken"] > 0)

    # Check and award badges
    badges = []
    next_milestone = None
    for m in MILESTONES:
        required = m["days_required"]
        unlocked = longest_streak >= required
        unlocked_at = None

        if unlocked:
            # Check if milestone notification already exists, or create it
            existing = db.scalar(
                select(Notification).where(
                    Notification.user_id == user.id,
                    Notification.notification_type == NotificationType.STREAK_MILESTONE,
                    Notification.related_entity_type == "STREAK_MILESTONE",
                    Notification.related_entity_id == required,
                )
            )
            if existing:
                unlocked_at = existing.created_at
            else:
                now_utc = datetime.now(timezone.utc)
                notif = Notification(
                    user_id=user.id,
                    notification_type=NotificationType.STREAK_MILESTONE,
                    title=f"Streak Milestone: {m['name']}!",
                    message=f"Congratulations! You've achieved a {required}-day medication adherence streak: {m['description']}",
                    related_entity_type="STREAK_MILESTONE",
                    related_entity_id=required,
                    sent_at=now_utc,
                    is_read=False,
                )
                db.add(notif)
                db.commit()
                unlocked_at = notif.created_at
        elif next_milestone is None:
            next_milestone = required

        badges.append({
            "id": m["id"],
            "name": m["name"],
            "days_required": required,
            "unlocked": unlocked,
            "unlocked_at": unlocked_at,
            "icon": m["icon"],
            "description": m["description"],
        })

    return {
        "current_streak_days": current_streak,
        "longest_streak_days": longest_streak,
        "total_active_days": total_active_days,
        "is_streak_active_today": is_streak_active_today,
        "badges": badges,
        "next_milestone": next_milestone,
    }
