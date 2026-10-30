"""Remote Push Notification Service (Expo Push API / APNs / FCM).

Dispatches push notifications to iOS and Android devices via the official Expo Push Service.
Also provides server-side remote dose reminder dispatching to ensure users receive notifications
even if their local app has not been launched within the 14-day rolling window.
"""

import json
import logging
import urllib.request
import urllib.error
from datetime import date, datetime, time, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.medicine import Medicine, MedicineSchedule
from app.models.user_device import UserDeviceToken

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def register_device_token(
    db: Session,
    user_id: int,
    push_token: str,
    platform: str = "expo",
    device_name: Optional[str] = None,
    p256dh: Optional[str] = None,
    auth: Optional[str] = None,
) -> UserDeviceToken:
    """Register or re-activate a user's device push token."""
    token_str = push_token.strip()
    device = (
        db.query(UserDeviceToken)
        .filter(UserDeviceToken.user_id == user_id, UserDeviceToken.push_token == token_str)
        .first()
    )
    if device:
        device.is_active = True
        device.platform = platform
        if device_name:
            device.device_name = device_name
        if p256dh is not None:
            device.p256dh = p256dh
        if auth is not None:
            device.auth = auth
        device.updated_at = datetime.now(timezone.utc)
    else:
        device = UserDeviceToken(
            user_id=user_id,
            push_token=token_str,
            platform=platform,
            device_name=device_name,
            p256dh=p256dh,
            auth=auth,
            is_active=True,
        )
        db.add(device)

    db.commit()
    db.refresh(device)
    logger.info("[push-device-registered] user_id=%s token=%s... platform=%s", user_id, token_str[:16], platform)
    return device


def register_web_push(
    db: Session,
    user_id: int,
    endpoint: str,
    p256dh: str,
    auth: str,
) -> UserDeviceToken:
    """Register a Web Push subscription (W3C Push API)."""
    return register_device_token(
        db,
        user_id=user_id,
        push_token=endpoint,
        platform="web",
        device_name="Web Browser",
        p256dh=p256dh,
        auth=auth,
    )


def unregister_device_token(db: Session, user_id: int, push_token: str) -> bool:
    """Deactivate or remove a device push token (e.g. on user sign-out)."""
    device = (
        db.query(UserDeviceToken)
        .filter(UserDeviceToken.user_id == user_id, UserDeviceToken.push_token == push_token.strip())
        .first()
    )
    if device:
        device.is_active = False
        device.updated_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("[push-device-unregistered] user_id=%s", user_id)
        return True
    return False


def list_user_device_tokens(db: Session, user_id: int) -> List[str]:
    """Return all active push tokens for a given user."""
    devices = (
        db.query(UserDeviceToken)
        .filter(UserDeviceToken.user_id == user_id, UserDeviceToken.is_active.is_(True))
        .all()
    )
    return [d.push_token for d in devices]


def send_push_notification(
    db: Session,
    user_id: int,
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
    badge: Optional[int] = None,
) -> int:
    """Send a push notification to all active devices registered by the user.

    Returns the number of messages successfully dispatched to the push gateway.
    """
    tokens = list_user_device_tokens(db, user_id)
    if not tokens:
        logger.debug("[push-skipped] user_id=%s has no active push tokens", user_id)
        return 0

    messages = []
    for token in tokens:
        msg = {
            "to": token,
            "title": title,
            "body": body,
            "sound": "default",
            "priority": "high",
        }
        if data:
            msg["data"] = data
        if badge is not None:
            msg["badge"] = badge
        messages.append(msg)

    # Deliver to Expo Push Gateway
    success_count = _deliver_expo_push_messages(messages)
    logger.info("[push-dispatched] user_id=%s messages=%s success=%s", user_id, len(messages), success_count)
    return success_count


def _deliver_expo_push_messages(messages: List[Dict[str, Any]]) -> int:
    """HTTP POST delivery to Expo Push Notifications REST API."""
    if not messages:
        return 0

    try:
        req_data = json.dumps(messages).encode("utf-8")
        req = urllib.request.Request(
            EXPO_PUSH_URL,
            data=req_data,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Accept-Encoding": "gzip, deflate",
            },
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=10) as resp:
            resp_body = resp.read().decode("utf-8")
            result = json.loads(resp_body)
            data = result.get("data", [])
            successes = sum(1 for item in data if item.get("status") == "ok")
            return successes

    except Exception as exc:  # noqa: BLE001
        logger.warning("[expo-push-gateway-notice] Push dispatch failed: %s", exc)
        return 0


def dispatch_due_medicine_reminders(
    db: Session,
    target_date: Optional[date] = None,
    user_id: Optional[int] = None,
) -> int:
    """Scan upcoming doses for today and dispatch remote push notifications for pending medications.

    Idempotent: Records dispatched reminders in notifications table to prevent double-sending the same dose.
    """
    from app.models.notification import Notification, NotificationType

    check_date = target_date or date.today()

    query = (
        db.query(MedicineSchedule)
        .join(Medicine, MedicineSchedule.medicine_id == Medicine.id)
        .filter(
            Medicine.is_active.is_(True),
            MedicineSchedule.scheduled_date == check_date,
            MedicineSchedule.is_taken.is_(False),
            MedicineSchedule.is_skipped.is_(False),
        )
    )

    if user_id is not None:
        query = query.filter(Medicine.user_id == user_id)

    schedules = query.all()

    dispatched = 0
    for entry in schedules:
        medicine = entry.medicine

        # Check idempotency: already dispatched for this schedule row?
        already_dispatched = (
            db.query(Notification)
            .filter(
                Notification.user_id == medicine.user_id,
                Notification.notification_type == NotificationType.MEDICINE_REMINDER,
                Notification.related_entity_type == "medicine_schedule",
                Notification.related_entity_id == entry.id,
            )
            .first()
        )
        if already_dispatched:
            continue

        dose_info = f"{medicine.dosage} {medicine.dosage_unit}" if medicine.dosage else ""
        title = f"Reminder: Time for {medicine.medicine_name}"
        body = f"Scheduled dose: {dose_info} • {medicine.instructions or 'Tap to log as taken.'}".strip(" • ")

        sent = send_push_notification(
            db=db,
            user_id=medicine.user_id,
            title=title,
            body=body,
            data={"kind": "medicine-reminder", "medicineId": medicine.id, "scheduleId": entry.id},
        )
        if sent > 0:
            dispatched += 1
            # Record notification entry to ensure idempotency
            rec = Notification(
                user_id=medicine.user_id,
                notification_type=NotificationType.MEDICINE_REMINDER,
                title=title,
                message=body,
                related_entity_type="medicine_schedule",
                related_entity_id=entry.id,
            )
            db.add(rec)
            db.commit()

    return dispatched
