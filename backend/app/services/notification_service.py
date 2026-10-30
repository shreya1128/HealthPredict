"""Notification inbox: persistence, read state, and derivation of notifications from the user's REAL records.

How notifications come to exist
-------------------------------
There is no background scheduler. `refresh_notifications` is called by a client when it opens (web inbox/bell,
mobile app) and derives notifications from existing rows. It is idempotent: each notification has a stable
(type, related_entity_type, related_entity_id) key, and one that already exists is never created again. Nothing is
invented: every notification points at a real record.

  MISSED_MEDICINE       doses of an ACTIVE medicine that are past-due (before today, last 3 days) and neither taken nor skipped
  ASSESSMENT_COMPLETED  an assessment saved in the last 7 days (one per assessment)
  WEEKLY_REPORT         a weekly report generated in the last 14 days
  GOAL_PROGRESS         a goal marked COMPLETED in the last 14 days
  WELLNESS_REMINDER     no assessment in the last 7 days (once per ISO week; not for accounts younger than 3 days)

MEDICINE_REMINDER and ADMIN_MESSAGE exist in the table's enum but are not produced here (dose reminders are local to the
device; there is no admin messaging feature).

There is deliberately no DELETE: with no tombstone column, a deleted derived notification would be re-created by the next
refresh. Read/unread is the supported state.

Delivery: this is an in-app inbox only. Nothing here sends a push notification.
"""

from datetime import date, timedelta
import logging
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.models import (
    HealthAssessment, Medicine, MedicineSchedule, Notification, NotificationType, User, WeeklyReport, WellnessGoal,
)
from app.models.health import RiskCategory
from app.models.tracking import GoalStatus
from app.utils.timeutil import utcnow

MISSED_LOOKBACK_DAYS = 3
ASSESSMENT_WINDOW_DAYS = 7
REPORT_WINDOW_DAYS = 14
GOAL_WINDOW_DAYS = 14
DUE_AFTER_DAYS = 7
NEW_ACCOUNT_GRACE_DAYS = 3


def _exists(db: Session, user_id: int, ntype: str, etype: str, eid: int) -> bool:
    return db.scalar(
        select(Notification.id).where(
            Notification.user_id == user_id, Notification.notification_type == ntype,
            Notification.related_entity_type == etype, Notification.related_entity_id == eid,
        ).limit(1)
    ) is not None


def _add_once(db: Session, user: User, ntype: str, title: str, message: str, etype: str, eid: int) -> int:
    if _exists(db, user.id, ntype, etype, eid):
        return 0
    db.add(Notification(user_id=user.id, notification_type=ntype, title=title[:255], message=message,
                        related_entity_type=etype, related_entity_id=eid, is_read=False))
    db.flush()
    try:
        from app.services import push_service
        push_service.send_push_notification(
            db, user.id, title=title, body=message,
            data={"type": ntype, "entityType": etype, "entityId": eid}
        )
    except Exception as exc:
        logger.warning("Push notification delivery failed for user %s: %s", user.id, exc)
    return 1


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def refresh_notifications(db: Session, user: User) -> int:
    """Creates any notifications that are due and do not exist yet. Returns how many were created."""
    # Serialise refreshes for one user (web bell + phone opening together): end any open snapshot, lock the user row,
    # then read fresh state. Without this two concurrent refreshes could both see "does not exist" and both insert.
    db.commit()
    db.execute(select(User.id).where(User.id == user.id).with_for_update())

    now = utcnow()
    today = now.date()
    created = 0

    # --- missed doses (active medicines only; "missed" = past-due, neither taken nor skipped, as everywhere else)
    since = today - timedelta(days=MISSED_LOOKBACK_DAYS)
    rows = db.execute(
        select(Medicine.id, Medicine.medicine_name, func.count(MedicineSchedule.id), func.max(MedicineSchedule.id))
        .join(MedicineSchedule, MedicineSchedule.medicine_id == Medicine.id)
        .where(Medicine.user_id == user.id, Medicine.is_active.is_(True),
               MedicineSchedule.is_taken.is_(False), MedicineSchedule.is_skipped.is_(False),
               MedicineSchedule.scheduled_date < today, MedicineSchedule.scheduled_date >= since)
        .group_by(Medicine.id, Medicine.medicine_name)
    ).all()
    for _mid, name, count, newest_schedule_id in rows:
        # Keyed on the newest missed dose: the same missed doses never notify twice, a newly missed dose does.
        created += _add_once(
            db, user, NotificationType.MISSED_MEDICINE, f"Missed doses: {name}",
            f"You haven't logged {_plural(int(count), 'dose')} of {name} in the last {MISSED_LOOKBACK_DAYS} days. "
            "Open your schedule to log or skip them.", "MEDICINE_SCHEDULE", int(newest_schedule_id),
        )

    # --- assessments completed recently
    for a in db.scalars(select(HealthAssessment).where(
            HealthAssessment.user_id == user.id, HealthAssessment.assessment_date >= today - timedelta(days=ASSESSMENT_WINDOW_DAYS))
            .order_by(HealthAssessment.id)):
        score = f"{float(a.health_score):.0f}" if a.health_score is not None else None
        level = (a.risk_category or "").lower()
        text = f"Your health score is {score} ({level} risk)." if score is not None else "Your results are ready."
        if a.risk_category == RiskCategory.HIGH:
            text += " This is an educational estimate, not a diagnosis; consider discussing it with a healthcare professional."
        created += _add_once(db, user, NotificationType.ASSESSMENT_COMPLETED, "Assessment complete", text, "ASSESSMENT", a.id)

    # --- weekly reports generated recently
    for r in db.scalars(select(WeeklyReport).where(
            WeeklyReport.user_id == user.id, WeeklyReport.created_at >= now - timedelta(days=REPORT_WINDOW_DAYS)).order_by(WeeklyReport.id)):
        created += _add_once(db, user, NotificationType.WEEKLY_REPORT, "Weekly report ready",
                             f"Your report for {r.week_start_date.isoformat()} to {r.week_end_date.isoformat()} is available.", "WEEKLY_REPORT", r.id)

    # --- goals completed recently
    for g in db.scalars(select(WellnessGoal).where(
            WellnessGoal.user_id == user.id, WellnessGoal.status == GoalStatus.COMPLETED,
            WellnessGoal.updated_at >= now - timedelta(days=GOAL_WINDOW_DAYS)).order_by(WellnessGoal.id)):
        label = g.goal_description or g.goal_type.replace("_", " ").lower()
        created += _add_once(db, user, NotificationType.GOAL_PROGRESS, "Goal completed", f"You completed your goal: {label}. Well done.", "GOAL", g.id)

    # --- gentle check-in reminder, at most once per ISO week
    account_age = (today - user.created_at.date()).days if user.created_at else 999
    if account_age >= NEW_ACCOUNT_GRACE_DAYS:
        last: Optional[date] = db.scalar(select(func.max(HealthAssessment.assessment_date)).where(HealthAssessment.user_id == user.id))
        days_since = (today - last).days if last else None
        if last is None or days_since >= DUE_AFTER_DAYS:
            iso = today.isocalendar()
            text = ("You haven't recorded a health assessment yet. A quick check-in gives you a score and personalised insights."
                    if last is None else f"It's been {_plural(days_since, 'day')} since your last health assessment. Recording one keeps your trends up to date.")
            created += _add_once(db, user, NotificationType.WELLNESS_REMINDER, "Time for a health check-in", text,
                                 "ASSESSMENT_DUE_WEEK", iso[0] * 100 + iso[1])

    db.commit()
    return created


def list_notifications(db: Session, user: User, page: int, page_size: int, unread_only: bool, ntype: Optional[str]):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    if ntype:
        stmt = stmt.where(Notification.notification_type == ntype)
    total = int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    items = db.scalars(stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return items, total


def unread_count(db: Session, user: User) -> int:
    return int(db.scalar(select(func.count()).where(Notification.user_id == user.id, Notification.is_read.is_(False))) or 0)


def mark_read(db: Session, user: User, notification_id: int) -> Notification:
    """404 (not 403) for someone else's notification, so ids don't reveal what exists."""
    n = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    if not n.is_read:
        n.is_read = True
        n.read_at = utcnow()
        db.commit()
        db.refresh(n)
    return n


def mark_all_read(db: Session, user: User) -> int:
    result = db.execute(
        update(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(False)).values(is_read=True, read_at=utcnow())
    )
    db.commit()
    return int(result.rowcount or 0)


def snooze_notification(db: Session, user: User, notification_id: int, minutes: int = 10) -> Notification:
    """Snooze a notification for a specified duration."""
    n = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")

    now = utcnow()
    n.snoozed_until = now + timedelta(minutes=minutes)
    n.is_read = False
    db.commit()
    db.refresh(n)
    return n


def get_user_preferences(db: Session, user: User) -> dict:
    """Retrieve user's quiet hours and reminder lead time."""
    db.refresh(user)
    return {
        "quiet_hours_start": user.quiet_hours_start.strftime("%H:%M") if user.quiet_hours_start else None,
        "quiet_hours_end": user.quiet_hours_end.strftime("%H:%M") if user.quiet_hours_end else None,
        "reminder_lead_time_minutes": user.reminder_lead_time_minutes or 15,
    }


def update_user_preferences(
    db: Session,
    user: User,
    quiet_hours_start: Optional[str] = None,
    quiet_hours_end: Optional[str] = None,
    reminder_lead_time_minutes: Optional[int] = None,
) -> dict:
    """Update user's quiet hours and reminder lead time."""
    from datetime import time as time_type

    def parse_time_str(val: Optional[str]):
        if not val:
            return None
        parts = val.strip().split(":")
        return time_type(int(parts[0]), int(parts[1]))

    if quiet_hours_start is not None:
        user.quiet_hours_start = parse_time_str(quiet_hours_start)
    if quiet_hours_end is not None:
        user.quiet_hours_end = parse_time_str(quiet_hours_end)
    if reminder_lead_time_minutes is not None:
        user.reminder_lead_time_minutes = reminder_lead_time_minutes

    db.commit()
    db.refresh(user)
    return get_user_preferences(db, user)

