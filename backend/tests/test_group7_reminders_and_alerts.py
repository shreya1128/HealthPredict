"""Group 7 Automated Integration Tests: Reminders, Alerts, Web Push, and Adherence Streaks.

Covers:
- R1: Reminder Scheduler (doses due, quiet hours suppression, caregiver missed doses > 60m, refill alerts, appointment reminders 24h & 2h)
- R2: Snooze endpoint & quiet hours / lead time preferences
- R3: Mobile push token registration & unregistration (eas.json / expo)
- R4: Web push VAPID key & subscription endpoints
- R5: Adherence streak calculation & milestone badges
"""

from datetime import date, datetime, time, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config.database import SessionLocal
from app.main import app
from app.models.care_profile import CaregiverAccess
from app.models.emergency_and_symptoms import DoctorAppointment
from app.models.medicine import Medicine, MedicineSchedule
from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.models.user_device import UserDeviceToken
from app.services import reminder_scheduler, streak_service


@pytest.fixture
def test_user(db: Session):
    """Fixture providing a primary test user."""
    email = f"group7_user_{datetime.now().timestamp()}@example.com"
    user = User(
        email=email,
        password_hash="hashed_pw_group7",
        full_name="Alex Rivera",
        reminder_lead_time_minutes=15,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User):
    """Fixture providing auth headers for the primary test user."""
    from app.utils.security import create_access_token
    token_str, _ = create_access_token(test_user.id, "USER")
    return {"Authorization": f"Bearer {token_str}"}


# ============================================================================
# R1: REMINDER SCHEDULER TESTS
# ============================================================================

def test_reminder_scheduler_doses_due_and_idempotency(db: Session, test_user: User):
    """R1: Test doses due within lead-time window and idempotent re-execution."""
    now_utc = datetime(2026, 10, 19, 9, 5, 0, tzinfo=timezone.utc)
    today = now_utc.date()

    # Create active medicine with dose scheduled at 09:15 (within 15-min lead time)
    med = Medicine(
        user_id=test_user.id,
        medicine_name="Lisinopril",
        dosage="10",
        dosage_unit="mg",
        is_active=True,
        start_date=today,
    )
    db.add(med)
    db.flush()

    sched = MedicineSchedule(
        medicine_id=med.id,
        scheduled_date=today,
        scheduled_time=time(9, 15),
        is_taken=False,
        is_skipped=False,
    )
    db.add(sched)
    db.commit()

    # Cycle 1: Should dispatch 1 dose reminder
    report1 = reminder_scheduler.run_reminder_cycle(db, now=now_utc, target_user_id=test_user.id)
    assert report1["doses_dispatched"] == 1

    notif = db.query(Notification).filter(
        Notification.user_id == test_user.id,
        Notification.notification_type == NotificationType.MEDICINE_REMINDER,
        Notification.related_entity_id == sched.id,
    ).first()
    assert notif is not None
    assert notif.sent_at is not None
    assert "Lisinopril" in notif.title

    # Cycle 2: Same time, should be idempotent (0 dispatched)
    report2 = reminder_scheduler.run_reminder_cycle(db, now=now_utc, target_user_id=test_user.id)
    assert report2["doses_dispatched"] == 0


def test_reminder_scheduler_quiet_hours_suppression(db: Session, test_user: User):
    """R1: Test that doses due during user quiet hours are suppressed."""
    # Set user quiet hours: 22:00 to 08:00
    test_user.quiet_hours_start = time(22, 0)
    test_user.quiet_hours_end = time(8, 0)
    db.commit()

    # Now is 23:15 (inside quiet hours)
    now_utc = datetime(2026, 10, 19, 23, 15, 0, tzinfo=timezone.utc)
    today = now_utc.date()

    med = Medicine(
        user_id=test_user.id,
        medicine_name="Melatonin",
        is_active=True,
        start_date=today,
    )
    db.add(med)
    db.flush()

    sched = MedicineSchedule(
        medicine_id=med.id,
        scheduled_date=today,
        scheduled_time=time(23, 15),
        is_taken=False,
        is_skipped=False,
    )
    db.add(sched)
    db.commit()

    # Run cycle: should be suppressed
    report = reminder_scheduler.run_reminder_cycle(db, now=now_utc, target_user_id=test_user.id)
    assert report["doses_dispatched"] == 0


def test_reminder_scheduler_missed_dose_caregiver_alert(db: Session, test_user: User):
    """R1: Test that doses missed by > 60 minutes alert caregivers with notify_missed_dose."""
    now_utc = datetime(2026, 10, 19, 14, 0, 0, tzinfo=timezone.utc)
    today = now_utc.date()

    # Caregiver user
    caregiver = User(
        email=f"cg_{datetime.now().timestamp()}@example.com",
        password_hash="hashed_pw",
        full_name="Caregiver Sam",
    )
    db.add(caregiver)
    db.flush()

    # Link caregiver with notify_missed_dose=True
    cg_access = CaregiverAccess(
        account_owner_id=test_user.id,
        caregiver_email=caregiver.email,
        caregiver_user_id=caregiver.id,
        status="ACCEPTED",
        notify_missed_dose=True,
        invite_token=f"invite_cg_{datetime.now().timestamp()}",
    )
    db.add(cg_access)

    # Medicine with dose scheduled at 12:00 (now is 14:00, which is > 60m overdue)
    med = Medicine(
        user_id=test_user.id,
        medicine_name="Metformin",
        is_active=True,
        start_date=today,
    )
    db.add(med)
    db.flush()

    sched = MedicineSchedule(
        medicine_id=med.id,
        scheduled_date=today,
        scheduled_time=time(12, 0),
        is_taken=False,
        is_skipped=False,
    )
    db.add(sched)
    db.commit()

    report = reminder_scheduler.run_reminder_cycle(db, now=now_utc, target_user_id=test_user.id)
    assert report["caregiver_missed_dispatched"] == 1

    # Verify notification in caregiver's inbox
    cg_notif = db.query(Notification).filter(
        Notification.user_id == caregiver.id,
        Notification.notification_type == NotificationType.MISSED_MEDICINE,
        Notification.related_entity_type == "caregiver_missed_dose",
        Notification.related_entity_id == sched.id,
    ).first()
    assert cg_notif is not None
    assert "Care Alert: Missed Dose" in cg_notif.title
    assert test_user.full_name in cg_notif.message


def test_reminder_scheduler_refill_alerts(db: Session, test_user: User):
    """R1: Test refill alerts when pills_remaining or days_left is low."""
    now_utc = datetime(2026, 10, 19, 10, 0, 0, tzinfo=timezone.utc)
    today = now_utc.date()

    # Medicine with 3 pills remaining, 1 pill per dose, 7 day threshold -> needs refill
    med = Medicine(
        user_id=test_user.id,
        medicine_name="Atorvastatin",
        quantity_on_hand=3,
        pills_per_dose=1,
        refill_threshold_days=7,
        is_active=True,
        start_date=today,
    )
    db.add(med)
    db.commit()

    report = reminder_scheduler.run_reminder_cycle(db, now=now_utc, target_user_id=test_user.id)
    assert report["refill_alerts_dispatched"] == 1

    refill_notif = db.query(Notification).filter(
        Notification.user_id == test_user.id,
        Notification.notification_type == NotificationType.REFILL_ALERT,
        Notification.related_entity_id == med.id,
    ).first()
    assert refill_notif is not None
    assert "Refill Alert: Atorvastatin" in refill_notif.title


def test_reminder_scheduler_appointment_reminders(db: Session, test_user: User):
    """R1: Test 24h and 2h appointment reminder dispatches."""
    now_utc = datetime(2026, 10, 19, 10, 0, 0, tzinfo=timezone.utc)

    # Appointment exactly 24 hours away
    appt_24h = DoctorAppointment(
        user_id=test_user.id,
        doctor_name="Sarah Jenkins",
        specialty="Cardiology",
        appointment_date=now_utc + timedelta(hours=24),
        status="UPCOMING",
    )
    # Appointment 2 hours away
    appt_2h = DoctorAppointment(
        user_id=test_user.id,
        doctor_name="Robert Chen",
        specialty="Endocrinology",
        appointment_date=now_utc + timedelta(hours=2),
        status="UPCOMING",
    )
    db.add_all([appt_24h, appt_2h])
    db.commit()

    report = reminder_scheduler.run_reminder_cycle(db, now=now_utc, target_user_id=test_user.id)
    assert report["appointments_dispatched"] == 2

    n24 = db.query(Notification).filter(
        Notification.user_id == test_user.id,
        Notification.related_entity_type == "appointment_reminder_24h",
        Notification.related_entity_id == appt_24h.id,
    ).first()
    assert n24 is not None
    assert "Tomorrow" in n24.title

    n2 = db.query(Notification).filter(
        Notification.user_id == test_user.id,
        Notification.related_entity_type == "appointment_reminder_2h",
        Notification.related_entity_id == appt_2h.id,
    ).first()
    assert n2 is not None
    assert "2 Hours" in n2.title


# ============================================================================
# R2: NOTIFICATION SNOOZE & PREFERENCES ENDPOINTS
# ============================================================================

def test_notification_snooze_endpoint(client: TestClient, db: Session, test_user: User, auth_headers: dict):
    """R2: Test POST /api/notifications/{id}/snooze and suppression during snooze period."""
    notif = Notification(
        user_id=test_user.id,
        notification_type=NotificationType.MEDICINE_REMINDER,
        title="Dose Reminder",
        message="Take 10mg",
        is_read=False,
    )
    db.add(notif)
    db.commit()

    # Snooze for 15 minutes
    resp = client.post(f"/api/notifications/{notif.id}/snooze", json={"minutes": 15}, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["snoozed_until"] is not None

    # Verify in DB
    db.refresh(notif)
    assert notif.snoozed_until is not None


def test_notification_preferences_endpoints(client: TestClient, db: Session, test_user: User, auth_headers: dict):
    """R2: Test GET & PUT /api/notifications/preferences."""
    # Read initial
    get_res = client.get("/api/notifications/preferences", headers=auth_headers)
    assert get_res.status_code == 200
    assert "reminder_lead_time_minutes" in get_res.json()

    # Update preferences
    payload = {
        "quiet_hours_start": "22:30",
        "quiet_hours_end": "07:30",
        "reminder_lead_time_minutes": 30,
    }
    put_res = client.put("/api/notifications/preferences", json=payload, headers=auth_headers)
    assert put_res.status_code == 200
    updated = put_res.json()
    assert updated["quiet_hours_start"] == "22:30"
    assert updated["quiet_hours_end"] == "07:30"
    assert updated["reminder_lead_time_minutes"] == 30


# ============================================================================
# R3: MOBILE PUSH TOKENS (EXPO / NATIVE)
# ============================================================================

def test_mobile_push_token_lifecycle(client: TestClient, test_user: User, auth_headers: dict):
    """R3: Test registering and unregistering mobile push tokens."""
    token = f"ExponentPushToken[{datetime.now().timestamp()}]"

    # Register
    reg_res = client.post(
        "/api/notifications/push-token",
        json={"push_token": token, "platform": "expo", "device_name": "iPhone 16 Pro"},
        headers=auth_headers,
    )
    assert reg_res.status_code == 200
    assert reg_res.json()["push_token"] == token

    # Check database with fresh session
    with SessionLocal() as s:
        device = s.query(UserDeviceToken).filter(UserDeviceToken.push_token == token).first()
        assert device is not None
        assert device.is_active is True

    # Unregister
    del_res = client.delete(f"/api/notifications/push-token?push_token={token}", headers=auth_headers)
    assert del_res.status_code == 200

    with SessionLocal() as s:
        device = s.query(UserDeviceToken).filter(UserDeviceToken.push_token == token).first()
        assert device is not None
        assert device.is_active is False


# ============================================================================
# R4: WEB PUSH (VAPID & SUBSCRIPTION)
# ============================================================================

def test_web_push_vapid_and_subscription(client: TestClient, test_user: User, auth_headers: dict):
    """R4: Test VAPID public key endpoint and Web Push subscription."""
    # 1. Fetch VAPID key
    key_res = client.get("/api/notifications/vapid-public-key")
    assert key_res.status_code == 200
    assert "public_key" in key_res.json()
    assert len(key_res.json()["public_key"]) > 20

    # 2. Subscribe browser endpoint
    endpoint_url = f"https://fcm.googleapis.com/fcm/send/fake_endpoint_{datetime.now().timestamp()}"
    sub_payload = {
        "endpoint": endpoint_url,
        "keys": {
            "p256dh": "fake_p256dh_key_base64url",
            "auth": "fake_auth_secret",
        },
    }
    sub_res = client.post("/api/notifications/web-push/subscribe", json=sub_payload, headers=auth_headers)
    assert sub_res.status_code == 200
    assert sub_res.json()["status"] == "subscribed"

    # Verify device record has platform='web', p256dh, and auth
    with SessionLocal() as s:
        web_dev = s.query(UserDeviceToken).filter(UserDeviceToken.push_token == endpoint_url).first()
        assert web_dev is not None
        assert web_dev.platform == "web"
        assert web_dev.p256dh == "fake_p256dh_key_base64url"
        assert web_dev.auth == "fake_auth_secret"

    # 3. Unsubscribe
    unsub_res = client.post("/api/notifications/web-push/unsubscribe", json={"endpoint": endpoint_url}, headers=auth_headers)
    assert unsub_res.status_code == 200

    with SessionLocal() as s:
        web_dev = s.query(UserDeviceToken).filter(UserDeviceToken.push_token == endpoint_url).first()
        assert web_dev is not None
        assert web_dev.is_active is False


# ============================================================================
# R5: ADHERENCE STREAKS & MILESTONE BADGES
# ============================================================================

def test_adherence_streak_calculation_and_milestones(client: TestClient, db: Session, test_user: User, auth_headers: dict):
    """R5: Test calculation of consecutive days of 100% adherence and milestone badges."""
    today = date.today()

    med = Medicine(
        user_id=test_user.id,
        medicine_name="Daily Multivitamin",
        is_active=True,
        start_date=today - timedelta(days=5),
    )
    db.add(med)
    db.flush()

    # Create 3 consecutive days of 100% taken doses: days -3, -2, -1
    for day_offset in [3, 2, 1]:
        d = today - timedelta(days=day_offset)
        s = MedicineSchedule(
            medicine_id=med.id,
            scheduled_date=d,
            scheduled_time=time(8, 0),
            is_taken=True,
            is_skipped=False,
        )
        db.add(s)

    db.commit()

    # Query streaks endpoint
    streak_res = client.get("/api/notifications/streaks", headers=auth_headers)
    assert streak_res.status_code == 200
    data = streak_res.json()

    assert data["current_streak_days"] >= 3
    assert data["longest_streak_days"] >= 3

    # Verify 3-day milestone badge is unlocked
    badge_3 = next((b for b in data["badges"] if b["days_required"] == 3), None)
    assert badge_3 is not None
    assert badge_3["unlocked"] is True

    # Verify STREAK_MILESTONE notification was created
    milestone_notif = db.query(Notification).filter(
        Notification.user_id == test_user.id,
        Notification.notification_type == NotificationType.STREAK_MILESTONE,
        Notification.related_entity_id == 3,
    ).first()
    assert milestone_notif is not None
    assert "Getting Started" in milestone_notif.title
