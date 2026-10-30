"""Comprehensive hardening tests for timezone handling in reminder_scheduler."""

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo
import pytest
from sqlalchemy.orm import Session

from app.models import (
    AppointmentStatus, DoctorAppointment, Medicine, MedicineSchedule, Notification, NotificationType, User,
)
from app.services.reminder_scheduler import run_reminder_cycle, _user_tz


def _create_user(db: Session, email: str, tz_name: str) -> User:
    user = User(
        email=email,
        full_name="Timezone Tester",
        password_hash="hash",
        timezone=tz_name,
        reminder_lead_time_minutes=15,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_med_schedule(db: Session, user: User, sched_date: date, sched_time: time) -> MedicineSchedule:
    med = Medicine(
        user_id=user.id,
        medicine_name="TzMed",
        dosage=Decimal("10.00"),
        start_date=date(2026, 1, 1),
        is_active=True,
    )
    db.add(med)
    db.commit()
    db.refresh(med)

    sched = MedicineSchedule(
        medicine_id=med.id,
        scheduled_date=sched_date,
        scheduled_time=sched_time,
        is_taken=False,
        is_skipped=False,
    )
    db.add(sched)
    db.commit()
    db.refresh(sched)
    return sched


def test_asia_kolkata_dose_dispatched_at_local_time(db: Session):
    """08:00 AM local time in Asia/Kolkata is 02:30 AM UTC.
    The scheduler must dispatch at 02:20 UTC (10 mins before), NOT at 08:00 UTC."""
    user = _create_user(db, "kolkata_user@example.com", "Asia/Kolkata")
    today = date(2026, 10, 25)
    sched = _create_med_schedule(db, user, today, time(8, 0))

    # Test 1: At 02:20 UTC (07:50 IST), lead_min=15 -> inside reminder window [02:15 UTC, 03:30 UTC]
    now_utc_due = datetime(2026, 10, 25, 2, 20, tzinfo=timezone.utc)
    res = run_reminder_cycle(db, now=now_utc_due, target_user_id=user.id)
    assert res["doses_dispatched"] == 1

    # Verify notification created
    notif = db.query(Notification).filter_by(user_id=user.id, related_entity_id=sched.id).first()
    assert notif is not None

    # Test 2: If we ran at 08:00 UTC (13:30 IST), window has ended at 03:30 UTC
    db.query(Notification).filter_by(user_id=user.id).delete()
    db.commit()

    now_utc_late = datetime(2026, 10, 25, 8, 0, tzinfo=timezone.utc)
    res2 = run_reminder_cycle(db, now=now_utc_late, target_user_id=user.id)
    assert res2["doses_dispatched"] == 0


def test_utc_user_dispatched_at_utc_time(db: Session):
    """User in UTC with 08:00 AM dose fires at 07:50 UTC, not 02:20 UTC."""
    user = _create_user(db, "utc_user@example.com", "UTC")
    today = date(2026, 10, 25)
    sched = _create_med_schedule(db, user, today, time(8, 0))

    now_utc_early = datetime(2026, 10, 25, 2, 20, tzinfo=timezone.utc)
    res = run_reminder_cycle(db, now=now_utc_early, target_user_id=user.id)
    assert res["doses_dispatched"] == 0

    now_utc_due = datetime(2026, 10, 25, 7, 50, tzinfo=timezone.utc)
    res2 = run_reminder_cycle(db, now=now_utc_due, target_user_id=user.id)
    assert res2["doses_dispatched"] == 1


def test_midnight_boundary_across_timezones(db: Session):
    """A dose scheduled for 00:15 local time on 2026-10-26 in Asia/Kolkata
    corresponds to 18:45 UTC on 2026-10-25.
    The scheduler's +/- 1 day window must pick it up and dispatch it on the 25th in UTC."""
    user = _create_user(db, "midnight_user@example.com", "Asia/Kolkata")
    tomorrow = date(2026, 10, 26)
    sched = _create_med_schedule(db, user, tomorrow, time(0, 15))

    # 18:45 UTC on 2026-10-25 is 00:15 IST on 2026-10-26.
    # With 15 min lead time, window is [18:30 UTC, 19:45 UTC].
    # At 18:35 UTC (10 mins before dose, 00:05 IST), it must dispatch.
    now_utc = datetime(2026, 10, 25, 18, 35, tzinfo=timezone.utc)
    res = run_reminder_cycle(db, now=now_utc, target_user_id=user.id)
    assert res["doses_dispatched"] == 1


def test_user_changes_timezone_updates_dose_timing(db: Session):
    """When a user changes their timezone from Asia/Kolkata to America/New_York,
    their local 14:00 dose changes from 08:30 UTC to 18:00 UTC (EDT UTC-4)."""
    user = _create_user(db, "relocated_user@example.com", "Asia/Kolkata")
    today = date(2026, 10, 25)
    sched = _create_med_schedule(db, user, today, time(14, 0))

    # Change user's timezone to America/New_York
    user.timezone = "America/New_York"
    db.commit()

    # In America/New_York on 2026-10-25 (EDT, UTC-4), 14:00 EDT = 18:00 UTC
    # At 08:30 UTC (the old Kolkata time), it should NOT dispatch
    now_old_kolkata = datetime(2026, 10, 25, 8, 30, tzinfo=timezone.utc)
    res = run_reminder_cycle(db, now=now_old_kolkata, target_user_id=user.id)
    assert res["doses_dispatched"] == 0

    # At 17:50 UTC (10 mins before 14:00 EDT), it MUST dispatch
    now_new_york = datetime(2026, 10, 25, 17, 50, tzinfo=timezone.utc)
    res2 = run_reminder_cycle(db, now=now_new_york, target_user_id=user.id)
    assert res2["doses_dispatched"] == 1


def test_dst_transition_preserves_local_hour(db: Session):
    """In Europe/London:
    - In winter (GMT, UTC+0): 09:00 local = 09:00 UTC.
    - In summer (BST, UTC+1): 09:00 local = 08:00 UTC.
    The scheduler must respect the daylight saving offset for the respective date."""
    user = _create_user(db, "london_user@example.com", "Europe/London")

    # Summer date: 2026-07-15 (BST, UTC+1)
    sched_summer = _create_med_schedule(db, user, date(2026, 7, 15), time(9, 0))
    now_summer = datetime(2026, 7, 15, 8, 50, tzinfo=timezone.utc)
    res_summer = run_reminder_cycle(db, now=now_summer, target_user_id=user.id)
    assert res_summer["doses_dispatched"] == 1

    # Clear notification
    db.query(Notification).filter_by(user_id=user.id).delete()
    db.commit()

    # Winter date: 2026-12-15 (GMT, UTC+0)
    sched_winter = _create_med_schedule(db, user, date(2026, 12, 15), time(9, 0))
    now_winter = datetime(2026, 12, 15, 8, 50, tzinfo=timezone.utc)
    res_winter = run_reminder_cycle(db, now=now_winter, target_user_id=user.id)
    assert res_winter["doses_dispatched"] == 1


def test_appointment_reminder_local_timezone(db: Session):
    """Doctor appointments scheduled in local timezone are converted to UTC correctly."""
    user = _create_user(db, "appt_user@example.com", "Asia/Kolkata")
    # Appointment on 2026-10-26 at 10:00 local time = 04:30 UTC
    appt = DoctorAppointment(
        user_id=user.id,
        doctor_name="Dr. Rao",
        location="Heart Care Center",
        appointment_date=datetime(2026, 10, 26, 10, 0),
        status=AppointmentStatus.UPCOMING,
    )
    db.add(appt)
    db.commit()

    # 24-hour reminder should trigger 24h before 04:30 UTC on Oct 26 -> 04:30 UTC on Oct 25
    # Window: 24h to 22h before -> [04:30 UTC, 06:30 UTC] on Oct 25
    now_24h_before = datetime(2026, 10, 25, 4, 35, tzinfo=timezone.utc)
    res = run_reminder_cycle(db, now=now_24h_before, target_user_id=user.id)
    assert res["appointments_dispatched"] == 1
