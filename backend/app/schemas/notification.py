from datetime import datetime, time
from typing import Optional

from pydantic import BaseModel, Field


class NotificationOut(BaseModel):
    id: int
    notification_type: str
    title: str
    message: Optional[str] = None
    is_read: bool
    read_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    snoozed_until: Optional[datetime] = None
    # Clients map (related_entity_type, related_entity_id) to their own screens; action_url is left unset because
    # web and mobile use different route paths.
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[int] = None
    action_url: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    total: int
    unread: int
    page: int
    page_size: int


class UnreadCountOut(BaseModel):
    unread: int


class RefreshOut(BaseModel):
    created: int


class ReadAllOut(BaseModel):
    updated: int


class SnoozeIn(BaseModel):
    minutes: int = Field(default=10, ge=1, le=1440)


class DeviceRegisterIn(BaseModel):
    push_token: str
    platform: Optional[str] = "expo"
    device_name: Optional[str] = None


class DeviceRegisterOut(BaseModel):
    id: int
    push_token: str
    platform: str
    device_name: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class WebPushKeys(BaseModel):
    p256dh: str
    auth: str


class WebPushSubscribeIn(BaseModel):
    endpoint: str
    keys: WebPushKeys


class VapidKeyOut(BaseModel):
    public_key: str


class NotificationPreferencesOut(BaseModel):
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    reminder_lead_time_minutes: int = 15


class NotificationPreferencesIn(BaseModel):
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    reminder_lead_time_minutes: Optional[int] = Field(default=15, ge=0, le=120)


class StreakBadgeOut(BaseModel):
    id: str
    name: str
    days_required: int
    unlocked: bool
    unlocked_at: Optional[datetime] = None
    icon: str
    description: str


class AdherenceStreakOut(BaseModel):
    current_streak_days: int
    longest_streak_days: int
    total_active_days: int
    is_streak_active_today: bool
    badges: list[StreakBadgeOut]
    next_milestone: Optional[int] = None


class PushDispatchOut(BaseModel):
    dispatched: int
    message: str


class ReminderSchedulerReportOut(BaseModel):
    doses_dispatched: int
    caregiver_missed_dispatched: int
    refill_alerts_dispatched: int
    appointments_dispatched: int
    wellness_reminders_dispatched: int
    total_dispatched: int
    message: str
