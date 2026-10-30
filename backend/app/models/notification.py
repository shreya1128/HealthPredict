"""In-app notification inbox. Mirrors the existing `notifications` table in database/schema.sql (no schema change)."""

from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, String, Text

from app.config.database import Base
from app.models.user import PK
from app.utils.timeutil import utcnow


class NotificationType:
    MEDICINE_REMINDER = "MEDICINE_REMINDER"      # dose reminders
    MISSED_MEDICINE = "MISSED_MEDICINE"
    WEEKLY_REPORT = "WEEKLY_REPORT"
    ASSESSMENT_COMPLETED = "ASSESSMENT_COMPLETED"
    GOAL_PROGRESS = "GOAL_PROGRESS"
    WELLNESS_REMINDER = "WELLNESS_REMINDER"
    ADMIN_MESSAGE = "ADMIN_MESSAGE"
    REFILL_ALERT = "REFILL_ALERT"
    APPOINTMENT_REMINDER = "APPOINTMENT_REMINDER"
    STREAK_MILESTONE = "STREAK_MILESTONE"

    ALL = (
        MEDICINE_REMINDER,
        MISSED_MEDICINE,
        WEEKLY_REPORT,
        ASSESSMENT_COMPLETED,
        GOAL_PROGRESS,
        WELLNESS_REMINDER,
        ADMIN_MESSAGE,
        REFILL_ALERT,
        APPOINTMENT_REMINDER,
        STREAK_MILESTONE,
    )


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    notification_type = Column(String(30), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text)
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime)
    sent_at = Column(DateTime)
    snoozed_until = Column(DateTime)
    related_entity_type = Column(String(100))
    related_entity_id = Column(BigInteger)
    action_url = Column(String(500))
    created_at = Column(DateTime, default=utcnow)
