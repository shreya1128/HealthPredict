"""Real-time Reminder Scheduler Service.

Runs every minute (or via API / cron trigger) to process:
1. Doses due: within quiet hours and lead time window, respecting snoozed_until.
2. Missed doses > 60 min: alerts caregivers with notify_missed_dose enabled.
3. Refill alerts: when days_left <= 5 or quantity_on_hand <= threshold.
4. Appointment reminders: 24h and 2h before doctor appointments.
5. Adherence streaks: milestone updates.

Fully idempotent with sent_at and entity keys.
"""

import asyncio
from datetime import date, datetime, time, timedelta, timezone
import logging
from typing import Any, Callable, Dict, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.care_profile import CaregiverAccess
from app.models.emergency_and_symptoms import DoctorAppointment
from app.models.medicine import Medicine, MedicineSchedule
from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.services import push_service, streak_service

logger = logging.getLogger(__name__)


def _user_tz(user: User) -> ZoneInfo:
    """Return the user's timezone as a ZoneInfo, falling back to UTC."""
    tz_name = getattr(user, "timezone", None) or "UTC"
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo("UTC")


def is_in_quiet_hours(start: Optional[time], end: Optional[time], current_time: time) -> bool:
    """Check if current_time falls within the user's quiet hours."""
    if not start or not end:
        return False
    if start <= end:
        return start <= current_time <= end
    # Wraps past midnight (e.g., 22:00 to 08:00)
    return current_time >= start or current_time <= end


def run_reminder_cycle(
    db: Session,
    now: Optional[datetime] = None,
    target_user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Execute a single reminder scheduler cycle across all users (or a specific user)."""
    from sqlalchemy import text

    lock_conn = None
    try:
        bind = db.get_bind()
        is_mysql = bind and bind.dialect.name == "mysql"
    except Exception:
        is_mysql = False

    if is_mysql and target_user_id is None:
        try:
            lock_conn = bind.connect()
            lock_res = lock_conn.execute(text("SELECT GET_LOCK('hp_reminder_cycle_lock', 2)")).scalar()
            if lock_res != 1:
                lock_conn.close()
                lock_conn = None
                logger.info("Another reminder scheduler worker is currently executing; skipping cycle.")
                return {"status": "skipped", "reason": "lock_acquired_by_another_worker"}
        except Exception as lock_err:
            logger.warning("Could not acquire advisory lock: %s", lock_err)
            if lock_conn:
                try:
                    lock_conn.close()
                except Exception:
                    pass
                lock_conn = None

    try:
        current_dt = now or datetime.now(timezone.utc)
        current_date = current_dt.date()

        doses_dispatched = 0
        caregiver_missed_dispatched = 0
        refill_alerts_dispatched = 0
        appointments_dispatched = 0
        wellness_reminders_dispatched = 0

        # ---------------------------------------------------------------------
        # 1. DOSES DUE & SNOOZED REMINDERS
        # Query +/- 1 calendar day around UTC today to account for timezone
        # offsets across the globe
        # ---------------------------------------------------------------------
        sched_query = (
            db.query(MedicineSchedule, Medicine, User)
            .join(Medicine, Medicine.id == MedicineSchedule.medicine_id)
            .join(User, User.id == Medicine.user_id)
            .filter(
                Medicine.is_active.is_(True),
                MedicineSchedule.scheduled_date.between(
                    current_date - timedelta(days=1),
                    current_date + timedelta(days=1),
                ),
                MedicineSchedule.is_taken.is_(False),
                MedicineSchedule.is_skipped.is_(False),
            )
        )
        if target_user_id is not None:
            sched_query = sched_query.filter(User.id == target_user_id)

        pending_schedules = sched_query.all()

        for sched, med, user in pending_schedules:
            user_tz = _user_tz(user)
            user_local_now = current_dt.astimezone(user_tz)

            # Check quiet hours against user's local time
            if is_in_quiet_hours(user.quiet_hours_start, user.quiet_hours_end, user_local_now.time()):
                continue

            lead_min = user.reminder_lead_time_minutes if user.reminder_lead_time_minutes is not None else 15
            dose_time = sched.scheduled_time or time(9, 0)
            # Combine schedule date with dose time in user's timezone, then convert to UTC
            dose_dt_local = datetime.combine(sched.scheduled_date, dose_time).replace(tzinfo=user_tz)
            dose_dt = dose_dt_local.astimezone(timezone.utc)

            # Check if the dose is in the reminder window (from lead_min before scheduled time up to 60 min after)
            window_start = dose_dt - timedelta(minutes=lead_min)
            window_end = dose_dt + timedelta(minutes=60)

            if not (window_start <= current_dt <= window_end):
                continue

            # Check existing notification
            existing_notif = (
                db.query(Notification)
                .filter(
                    Notification.user_id == user.id,
                    Notification.notification_type == NotificationType.MEDICINE_REMINDER,
                    Notification.related_entity_type == "medicine_schedule",
                    Notification.related_entity_id == sched.id,
                )
                .first()
            )

            should_dispatch = False
            if not existing_notif:
                # First dispatch for this dose
                should_dispatch = True
            elif existing_notif.snoozed_until and existing_notif.snoozed_until <= current_dt:
                # Snooze period has expired; re-dispatch
                should_dispatch = True
                existing_notif.snoozed_until = None

            if should_dispatch:
                dose_info = f"{med.dosage} {med.dosage_unit}" if med.dosage else ""
                title = f"Medication Reminder: {med.medicine_name}"
                body = f"Scheduled for {dose_time.strftime('%H:%M')}: {dose_info} • {med.instructions or 'Tap Taken or Snooze'}".strip(" • ")

                push_service.send_push_notification(
                    db=db,
                    user_id=user.id,
                    title=title,
                    body=body,
                    data={
                        "type": "medicine_reminder",
                        "medicineId": med.id,
                        "scheduleId": sched.id,
                        "actions": ["taken", "snooze"],
                    },
                )

                if existing_notif:
                    existing_notif.sent_at = current_dt
                    existing_notif.message = body
                else:
                    db.add(
                        Notification(
                            user_id=user.id,
                            notification_type=NotificationType.MEDICINE_REMINDER,
                            title=title,
                            message=body,
                            related_entity_type="medicine_schedule",
                            related_entity_id=sched.id,
                            sent_at=current_dt,
                            is_read=False,
                        )
                    )
                db.commit()
                doses_dispatched += 1

        # ---------------------------------------------------------------------
        # 2. MISSED DOSES > 60 MIN TO CAREGIVERS
        # ---------------------------------------------------------------------
        missed_query = (
            db.query(MedicineSchedule, Medicine, User)
            .join(Medicine, Medicine.id == MedicineSchedule.medicine_id)
            .join(User, User.id == Medicine.user_id)
            .filter(
                Medicine.is_active.is_(True),
                MedicineSchedule.scheduled_date.between(
                    current_date - timedelta(days=1),
                    current_date + timedelta(days=1),
                ),
                MedicineSchedule.is_taken.is_(False),
                MedicineSchedule.is_skipped.is_(False),
            )
        )
        if target_user_id is not None:
            missed_query = missed_query.filter(User.id == target_user_id)

        all_missed = missed_query.all()
        for sched, med, patient in all_missed:
            dose_time = sched.scheduled_time or time(9, 0)
            # Convert dose time from patient's timezone to UTC
            patient_tz = _user_tz(patient)
            dose_dt_local = datetime.combine(sched.scheduled_date, dose_time).replace(tzinfo=patient_tz)
            dose_dt = dose_dt_local.astimezone(timezone.utc)

            if current_dt < dose_dt + timedelta(minutes=60):
                continue  # Not yet overdue by 60 min

            # Find active caregivers for this patient with notify_missed_dose enabled
            caregivers = (
                db.query(CaregiverAccess)
                .filter(
                    CaregiverAccess.account_owner_id == patient.id,
                    CaregiverAccess.status == "ACCEPTED",
                    CaregiverAccess.notify_missed_dose.is_(True),
                )
                .all()
            )

            for cg in caregivers:
                if not cg.caregiver_user_id:
                    continue

                # Idempotency check: already notified caregiver for this dose?
                already_alerted = (
                    db.query(Notification)
                    .filter(
                        Notification.user_id == cg.caregiver_user_id,
                        Notification.notification_type == NotificationType.MISSED_MEDICINE,
                        Notification.related_entity_type == "caregiver_missed_dose",
                        Notification.related_entity_id == sched.id,
                    )
                    .first()
                )
                if already_alerted:
                    continue

                cg_title = f"Care Alert: Missed Dose for {patient.full_name}"
                cg_body = (
                    f"{patient.full_name} was scheduled to take {med.medicine_name} at "
                    f"{dose_time.strftime('%H:%M')}, which is now over 60 minutes overdue."
                )

                push_service.send_push_notification(
                    db=db,
                    user_id=cg.caregiver_user_id,
                    title=cg_title,
                    body=cg_body,
                    data={
                        "type": "caregiver_missed_dose",
                        "patientId": patient.id,
                        "scheduleId": sched.id,
                        "medicineId": med.id,
                    },
                )

                db.add(
                    Notification(
                        user_id=cg.caregiver_user_id,
                        notification_type=NotificationType.MISSED_MEDICINE,
                        title=cg_title,
                        message=cg_body,
                        related_entity_type="caregiver_missed_dose",
                        related_entity_id=sched.id,
                        sent_at=current_dt,
                        is_read=False,
                    )
                )
                db.commit()
                caregiver_missed_dispatched += 1

        # ---------------------------------------------------------------------
        # 3. REFILL ALERTS (days_left <= 5 or quantity_on_hand <= threshold)
        # ---------------------------------------------------------------------
        med_query = db.query(Medicine).filter(Medicine.is_active.is_(True))
        if target_user_id is not None:
            med_query = med_query.filter(Medicine.user_id == target_user_id)

        active_medicines = med_query.all()
        for med in active_medicines:
            days_left = med.days_left
            threshold = med.refill_threshold_days or 5
            needs_refill = False

            if days_left is not None and days_left <= 5:
                needs_refill = True
            elif med.quantity_on_hand is not None:
                pills_per_day = med.pills_per_dose or 1
                if med.quantity_on_hand <= (pills_per_day * threshold):
                    needs_refill = True

            if needs_refill:
                # Check if refill alert sent in the last 7 days
                seven_days_ago = current_dt - timedelta(days=7)
                recent_alert = (
                    db.query(Notification)
                    .filter(
                        Notification.user_id == med.user_id,
                        Notification.notification_type == NotificationType.REFILL_ALERT,
                        Notification.related_entity_type == "medicine_refill",
                        Notification.related_entity_id == med.id,
                        Notification.created_at >= seven_days_ago,
                    )
                    .first()
                )
                if not recent_alert:
                    pills_msg = f"({med.quantity_on_hand} pills remaining)" if med.quantity_on_hand is not None else ""
                    refill_title = f"Refill Alert: {med.medicine_name}"
                    refill_body = (
                        f"Your supply of {med.medicine_name} is running low {pills_msg}. "
                        "Please contact your pharmacy or doctor for a refill."
                    )

                    push_service.send_push_notification(
                        db=db,
                        user_id=med.user_id,
                        title=refill_title,
                        body=refill_body,
                        data={"type": "refill_alert", "medicineId": med.id},
                    )

                    db.add(
                        Notification(
                            user_id=med.user_id,
                            notification_type=NotificationType.REFILL_ALERT,
                            title=refill_title,
                            message=refill_body,
                            related_entity_type="medicine_refill",
                            related_entity_id=med.id,
                            sent_at=current_dt,
                            is_read=False,
                        )
                    )
                    db.commit()
                    refill_alerts_dispatched += 1

        # ---------------------------------------------------------------------
        # 4. APPOINTMENT REMINDERS (24h and 2h before doctor appointments)
        # ---------------------------------------------------------------------
        appt_query = db.query(DoctorAppointment).filter(
            DoctorAppointment.status == "UPCOMING",
            DoctorAppointment.appointment_date > current_dt,
        )
        if target_user_id is not None:
            appt_query = appt_query.filter(DoctorAppointment.user_id == target_user_id)

        upcoming_appts = appt_query.all()
        for appt in upcoming_appts:
            appt_user = db.query(User).filter(User.id == appt.user_id).first()
            user_tz = _user_tz(appt_user) if appt_user else ZoneInfo("UTC")
            appt_dt = appt.appointment_date
            if appt_dt.tzinfo is None:
                appt_dt = appt_dt.replace(tzinfo=user_tz).astimezone(timezone.utc)
            else:
                appt_dt = appt_dt.astimezone(timezone.utc)

            time_to_appt = appt_dt - current_dt

            # 24-hour reminder: between 23h and 25h away
            if timedelta(hours=23) <= time_to_appt <= timedelta(hours=25):
                already_notified = (
                    db.query(Notification)
                    .filter(
                        Notification.user_id == appt.user_id,
                        Notification.notification_type == NotificationType.APPOINTMENT_REMINDER,
                        Notification.related_entity_type == "appointment_reminder_24h",
                        Notification.related_entity_id == appt.id,
                    )
                    .first()
                )
                if not already_notified:
                    title = f"Appointment Tomorrow: Dr. {appt.doctor_name}"
                    body = (
                        f"Reminder: You have an appointment with Dr. {appt.doctor_name} "
                        f"({appt.specialty or 'Healthcare Provider'}) tomorrow at {appt_dt.strftime('%H:%M')}."
                    )
                    push_service.send_push_notification(
                        db=db,
                        user_id=appt.user_id,
                        title=title,
                        body=body,
                        data={"type": "appointment_reminder", "appointmentId": appt.id},
                    )
                    db.add(
                        Notification(
                            user_id=appt.user_id,
                            notification_type=NotificationType.APPOINTMENT_REMINDER,
                            title=title,
                            message=body,
                            related_entity_type="appointment_reminder_24h",
                            related_entity_id=appt.id,
                            sent_at=current_dt,
                            is_read=False,
                        )
                    )
                    db.commit()
                    appointments_dispatched += 1

            # 2-hour reminder: between 1h and 3h away
            elif timedelta(hours=1) <= time_to_appt <= timedelta(hours=3):
                already_notified = (
                    db.query(Notification)
                    .filter(
                        Notification.user_id == appt.user_id,
                        Notification.notification_type == NotificationType.APPOINTMENT_REMINDER,
                        Notification.related_entity_type == "appointment_reminder_2h",
                        Notification.related_entity_id == appt.id,
                    )
                    .first()
                )
                if not already_notified:
                    title = f"Appointment in 2 Hours: Dr. {appt.doctor_name}"
                    body = (
                        f"Your appointment with Dr. {appt.doctor_name} is today at "
                        f"{appt_dt.strftime('%H:%M')} at {appt.location or 'clinic'}."
                    )
                    push_service.send_push_notification(
                        db=db,
                        user_id=appt.user_id,
                        title=title,
                        body=body,
                        data={"type": "appointment_reminder", "appointmentId": appt.id},
                    )
                    db.add(
                        Notification(
                            user_id=appt.user_id,
                            notification_type=NotificationType.APPOINTMENT_REMINDER,
                            title=title,
                            message=body,
                            related_entity_type="appointment_reminder_2h",
                            related_entity_id=appt.id,
                            sent_at=current_dt,
                            is_read=False,
                        )
                    )
                    db.commit()
                    appointments_dispatched += 1

        # ---------------------------------------------------------------------
        # 5. STREAK RECALCULATION & MILESTONES
        # ---------------------------------------------------------------------
        # If target_user_id given, check streaks for that user
        if target_user_id is not None:
            target_u = db.get(User, target_user_id)
            if target_u:
                streak_service.calculate_adherence_streak(db, target_u, current_date)

        # ---------------------------------------------------------------------
        # 6. PERIODIC HOUSEKEEPING (runs once per cycle, lightweight)
        # ---------------------------------------------------------------------
        try:
            from app.models.token_blocklist import TokenBlocklist
            TokenBlocklist.purge_expired(db)
        except Exception:
            pass  # Non-critical; will retry next cycle

        total = doses_dispatched + caregiver_missed_dispatched + refill_alerts_dispatched + appointments_dispatched + wellness_reminders_dispatched
        logger.info(
            "[reminder-cycle] complete. doses=%s caregiver_missed=%s refill=%s appts=%s total=%s",
            doses_dispatched, caregiver_missed_dispatched, refill_alerts_dispatched, appointments_dispatched, total
        )

        return {
            "doses_dispatched": doses_dispatched,
            "caregiver_missed_dispatched": caregiver_missed_dispatched,
            "refill_alerts_dispatched": refill_alerts_dispatched,
            "appointments_dispatched": appointments_dispatched,
            "wellness_reminders_dispatched": wellness_reminders_dispatched,
            "total_dispatched": total,
            "message": f"Reminder scheduler processed: {total} notifications dispatched.",
        }
    finally:
        if lock_conn:
            try:
                lock_conn.execute(text("SELECT RELEASE_LOCK('hp_reminder_cycle_lock')"))
            except Exception:
                pass
            finally:
                try:
                    lock_conn.close()
                except Exception:
                    pass


# ---------------------------------------------------------------------------
# Background loop (started from app lifespan in main.py)
# ---------------------------------------------------------------------------

def next_delay(consecutive_failures: int, base_seconds: float, max_seconds: float) -> float:
    """Seconds to wait before the next tick: the normal interval, or exponential backoff after failures."""
    if consecutive_failures <= 0:
        return base_seconds
    return min(max_seconds, base_seconds * (2 ** consecutive_failures))


def _run_one_tick(session_factory: Callable[[], Any], cycle: Callable[[Session], Any]) -> None:
    with session_factory() as db:
        cycle(db)


async def scheduler_loop(
    session_factory: Callable[[], Any],
    interval_seconds: float = 60.0,
    max_backoff_seconds: float = 900.0,
    cycle: Optional[Callable[[Session], Any]] = None,
) -> None:
    """Run the reminder cycle forever.

    * The (blocking) database work runs in a worker thread so the API stays responsive.
    * After a failure the wait doubles each time (capped), instead of logging every minute forever.
    * A full traceback is logged only for a new kind of error; repeats get one short line.
    * Recovery is logged once. Cancellation (app shutdown) stops the loop cleanly.
    """
    run = cycle or run_reminder_cycle
    failures = 0
    last_signature: Optional[str] = None
    while True:
        await asyncio.sleep(next_delay(failures, interval_seconds, max_backoff_seconds))
        try:
            await asyncio.to_thread(_run_one_tick, session_factory, run)
        except asyncio.CancelledError:
            raise
        except Exception as ex:  # noqa: BLE001 - the loop must survive any single failure
            failures += 1
            signature = f"{type(ex).__name__}: {str(ex)[:200]}"
            retry_in = next_delay(failures, interval_seconds, max_backoff_seconds)
            if signature != last_signature:
                logger.error(
                    "Reminder scheduler tick failed (consecutive failures: %d, retry in %.0fs)",
                    failures, retry_in, exc_info=True,
                )
                last_signature = signature
            else:
                logger.warning(
                    "Reminder scheduler still failing (consecutive failures: %d, retry in %.0fs): %s",
                    failures, retry_in, signature,
                )
        else:
            if failures:
                logger.info("Reminder scheduler recovered after %d failed tick(s).", failures)
            failures = 0
            last_signature = None
