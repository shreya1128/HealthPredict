from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.config.settings import settings
from app.middleware.auth import get_current_user, get_current_user_optional
from app.models import NotificationType, User
from app.schemas.notification import (
    AdherenceStreakOut,
    DeviceRegisterIn,
    DeviceRegisterOut,
    NotificationOut,
    NotificationPage,
    NotificationPreferencesIn,
    NotificationPreferencesOut,
    PushDispatchOut,
    ReadAllOut,
    RefreshOut,
    ReminderSchedulerReportOut,
    SnoozeIn,
    UnreadCountOut,
    VapidKeyOut,
    WebPushSubscribeIn,
)
from app.services import notification_service, push_service, reminder_scheduler, streak_service

router = APIRouter()

TypeFilter = Literal[tuple(NotificationType.ALL)]  # type: ignore[valid-type]


@router.get("", response_model=NotificationPage)
def list_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    unread_only: bool = Query(False),
    notification_type: Optional[TypeFilter] = Query(None, alias="type"),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    items, total = notification_service.list_notifications(db, user, page, page_size, unread_only, notification_type)
    return NotificationPage(items=items, total=total, unread=notification_service.unread_count(db, user), page=page, page_size=page_size)


@router.get("/unread-count", response_model=UnreadCountOut)
def unread_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return UnreadCountOut(unread=notification_service.unread_count(db, user))


@router.post("/refresh", response_model=RefreshOut)
def refresh(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Creates any notifications that are due from the user's real records. Idempotent; call when a client opens."""
    return RefreshOut(created=notification_service.refresh_notifications(db, user))


@router.get("/preferences", response_model=NotificationPreferencesOut)
def get_preferences(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get quiet hours and reminder lead time preferences."""
    return notification_service.get_user_preferences(db, user)


@router.put("/preferences", response_model=NotificationPreferencesOut)
def update_preferences(data: NotificationPreferencesIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update quiet hours and reminder lead time preferences."""
    return notification_service.update_user_preferences(
        db,
        user,
        quiet_hours_start=data.quiet_hours_start,
        quiet_hours_end=data.quiet_hours_end,
        reminder_lead_time_minutes=data.reminder_lead_time_minutes,
    )


@router.get("/streaks", response_model=AdherenceStreakOut)
def get_streaks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get medication adherence streaks and milestone badges."""
    return streak_service.calculate_adherence_streak(db, user)


@router.get("/vapid-public-key", response_model=VapidKeyOut)
def get_vapid_public_key():
    """Retrieve the application server's VAPID public key for Web Push."""
    key = getattr(settings, "VAPID_PUBLIC_KEY", "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSPO4hCEFiTjzqt5TjDxKU_fYU8kS5Fi5m8E")
    return VapidKeyOut(public_key=key)


@router.post("/web-push/subscribe")
def subscribe_web_push(data: WebPushSubscribeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Subscribe browser to Web Push notifications."""
    device = push_service.register_web_push(
        db,
        user_id=user.id,
        endpoint=data.endpoint,
        p256dh=data.keys.p256dh,
        auth=data.keys.auth,
    )
    return {"status": "subscribed", "device_id": device.id}


@router.post("/web-push/unsubscribe")
def unsubscribe_web_push(data: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Unsubscribe browser from Web Push notifications."""
    endpoint = data.get("endpoint")
    if not endpoint:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing endpoint")
    push_service.unregister_device_token(db, user_id=user.id, push_token=endpoint)
    return {"status": "unsubscribed"}


@router.post("/devices", response_model=DeviceRegisterOut)
@router.post("/push-token", response_model=DeviceRegisterOut)
def register_device(data: DeviceRegisterIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Register mobile device push token (Expo Push / APNs / FCM)."""
    device = push_service.register_device_token(
        db, user_id=user.id, push_token=data.push_token, platform=data.platform or "expo", device_name=data.device_name
    )
    return device


@router.delete("/devices")
@router.delete("/push-token")
def unregister_device(push_token: str = Query(..., min_length=1), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Unregister device push token on logout."""
    push_service.unregister_device_token(db, user_id=user.id, push_token=push_token)
    return {"status": "unregistered"}


@router.post("/dispatch-reminders", response_model=PushDispatchOut)
def dispatch_reminders(
    target_user_id: Optional[int] = Query(None, description="Optional target user ID (admin only)"),
    internal_key: Optional[str] = Header(None, alias="X-Internal-Api-Key"),
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Trigger server-side push notifications for today's pending doses."""
    is_internal = bool(settings.INTERNAL_API_KEY and internal_key == settings.INTERNAL_API_KEY)
    is_admin = bool(user and user.role == "ADMIN")

    if not is_internal and not is_admin:
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
        target_user_id = user.id
    elif is_admin and target_user_id is None:
        target_user_id = None
    elif is_internal and target_user_id is None:
        target_user_id = None

    count = push_service.dispatch_due_medicine_reminders(db, user_id=target_user_id)
    return PushDispatchOut(dispatched=count, message=f"Dispatched {count} remote reminders.")


@router.post("/scheduler/run", response_model=ReminderSchedulerReportOut)
def trigger_scheduler_cycle(
    target_user_id: Optional[int] = Query(None, description="Optional target user ID (admin/internal only)"),
    internal_key: Optional[str] = Header(None, alias="X-Internal-Api-Key"),
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Execute a real reminder scheduler cycle (doses, caregiver alerts, refills, appointments)."""
    is_internal = bool(settings.INTERNAL_API_KEY and internal_key == settings.INTERNAL_API_KEY)
    is_admin = bool(user and user.role == "ADMIN")

    if not is_internal and not is_admin:
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
        target_user_id = user.id
    elif is_admin and target_user_id is None:
        target_user_id = None
    elif is_internal and target_user_id is None:
        target_user_id = None

    report = reminder_scheduler.run_reminder_cycle(db, target_user_id=target_user_id)
    return ReminderSchedulerReportOut(**report)


@router.post("/read-all", response_model=ReadAllOut)
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ReadAllOut(updated=notification_service.mark_all_read(db, user))


@router.post("/{notification_id}/read", response_model=NotificationOut)
def read_one(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return notification_service.mark_read(db, user, notification_id)


@router.post("/{notification_id}/snooze", response_model=NotificationOut)
def snooze_notification(notification_id: int, data: SnoozeIn = SnoozeIn(), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Snooze a dose or appointment notification for X minutes (default: 10 minutes)."""
    return notification_service.snooze_notification(db, user, notification_id, minutes=data.minutes)
