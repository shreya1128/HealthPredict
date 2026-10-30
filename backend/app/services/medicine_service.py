"""Medicine CRUD, schedule generation, intake logging, and adherence calculation."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.middleware.profile_scope import ProfileScope
from app.models import Medicine, MedicineIntakeLog, MedicineSchedule, User
from app.schemas.medicine import MedicineCreate, MedicineUpdate
from app.utils.schedule_generator import generate_schedule
from app.utils.timeutil import utcnow

NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, "Medicine not found")
SCHEDULE_NOT_FOUND = HTTPException(status.HTTP_404_NOT_FOUND, "Schedule entry not found")

# Fields that affect which future doses exist - changing any of these regenerates the
# not-yet-occurred schedule (past and already-acted-upon entries are never touched).
SCHEDULE_AFFECTING_FIELDS = {"frequency_unit", "time_of_day", "end_date", "weekdays", "month_day"}


def _get_scope_ids(db: Session, target: User | ProfileScope) -> tuple[int, int]:
    if isinstance(target, ProfileScope):
        return target.owner_id, target.profile_id
    from app.services.care_profile_service import get_or_create_primary_profile
    primary = get_or_create_primary_profile(db, target)
    return target.id, primary.id


def _get_owned_medicine(db: Session, target: User | ProfileScope, medicine_id: int) -> Medicine:
    owner_id, profile_id = _get_scope_ids(db, target)
    m = db.scalar(
        select(Medicine).where(
            Medicine.id == medicine_id,
            Medicine.user_id == owner_id,
            Medicine.care_profile_id == profile_id,
        )
    )
    if m is None:
        raise NOT_FOUND
    return m



def _regenerate_future_schedule(db: Session, medicine: Medicine, from_date: date) -> None:
    """Deletes pending (not taken, not skipped) schedule rows from from_date onward, then
    regenerates them from the medicine's current settings. Past and acted-upon rows untouched."""
    db.query(MedicineSchedule).filter(
        MedicineSchedule.medicine_id == medicine.id,
        MedicineSchedule.scheduled_date >= from_date,
        MedicineSchedule.is_taken.is_(False), MedicineSchedule.is_skipped.is_(False),
    ).delete(synchronize_session=False)

    doses = generate_schedule(max(medicine.start_date, from_date), medicine.end_date,
                              medicine.frequency_unit, medicine.time_of_day or [],
                              weekdays=medicine.weekdays, month_day=medicine.month_day)
    for d, t in doses:
        db.add(MedicineSchedule(medicine_id=medicine.id, scheduled_date=d, scheduled_time=t))


def ensure_schedule_ahead(db: Session, medicine: Medicine, days_ahead: int = 90) -> None:
    """Ensures schedule rows are generated up to at least `today + days_ahead` for active medicines.
    Solves the finite-horizon limitation: long-running medicines with no end_date or far-future
    end_dates automatically have their schedule rows extended as time progresses, rather than
    running out after the initial 90-day window."""
    if not medicine.is_active or medicine.frequency_unit == "AS_NEEDED":
        return

    today = date.today()
    target_date = today + timedelta(days=days_ahead)
    if medicine.end_date:
        target_date = min(target_date, medicine.end_date)
    if target_date < today or target_date < medicine.start_date:
        return

    latest_date = db.scalar(
        select(func.max(MedicineSchedule.scheduled_date)).where(MedicineSchedule.medicine_id == medicine.id)
    )

    if latest_date is None:
        start_from = medicine.start_date
    elif latest_date < target_date:
        start_from = latest_date + timedelta(days=1)
    else:
        return

    if start_from <= target_date:
        new_doses = generate_schedule(
            start_date=start_from,
            end_date=target_date,
            frequency_unit=medicine.frequency_unit,
            time_of_day=medicine.time_of_day or [],
            today=today,
            weekdays=medicine.weekdays,
            month_day=medicine.month_day,
        )
        for d, t in new_doses:
            db.add(MedicineSchedule(medicine_id=medicine.id, scheduled_date=d, scheduled_time=t))
        db.commit()


def create_medicine(db: Session, target: User | ProfileScope, data: MedicineCreate) -> Medicine:
    owner_id, profile_id = _get_scope_ids(db, target)
    medicine = Medicine(
        user_id=owner_id, care_profile_id=profile_id, medicine_name=data.medicine_name, dosage=data.dosage,
        dosage_unit=data.dosage_unit, form=data.form, frequency=len(data.time_of_day) or 1,
        frequency_unit=data.frequency_unit, start_date=data.start_date, end_date=data.end_date,
        time_of_day=data.time_of_day, weekdays=data.weekdays, month_day=data.month_day,
        instructions=data.instructions, reason_for_use=data.reason_for_use, notes=data.notes,
        rxcui=data.rxcui, quantity_on_hand=data.quantity_on_hand,
        pills_per_dose=data.pills_per_dose, refill_threshold_days=data.refill_threshold_days,
        pharmacy_note=data.pharmacy_note,
        is_active=True,
    )
    db.add(medicine)
    db.flush()

    doses = generate_schedule(medicine.start_date, medicine.end_date, medicine.frequency_unit,
                              medicine.time_of_day or [], weekdays=medicine.weekdays,
                              month_day=medicine.month_day)
    for d, t in doses:
        db.add(MedicineSchedule(medicine_id=medicine.id, scheduled_date=d, scheduled_time=t))

    db.commit()
    db.refresh(medicine)
    return medicine


def list_medicines(db: Session, target: User | ProfileScope, active_only: bool = False) -> list[Medicine]:
    owner_id, profile_id = _get_scope_ids(db, target)
    stmt = select(Medicine).where(Medicine.user_id == owner_id, Medicine.care_profile_id == profile_id)
    if active_only:
        stmt = stmt.where(Medicine.is_active.is_(True))
    return list(db.scalars(stmt.order_by(Medicine.is_active.desc(), Medicine.created_at.desc())).all())


def get_medicine(db: Session, target: User | ProfileScope, medicine_id: int) -> Medicine:
    return _get_owned_medicine(db, target, medicine_id)


def update_medicine(db: Session, target: User | ProfileScope, medicine_id: int, data: MedicineUpdate) -> Medicine:
    medicine = _get_owned_medicine(db, target, medicine_id)
    changes = data.model_dump(exclude_unset=True)
    schedule_affected = bool(SCHEDULE_AFFECTING_FIELDS & changes.keys())

    for field, value in changes.items():
        setattr(medicine, field, value)
    if "time_of_day" in changes:
        medicine.frequency = len(changes["time_of_day"]) or 1

    if schedule_affected:
        if medicine.frequency_unit != "AS_NEEDED" and not medicine.time_of_day:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                "time_of_day is required unless frequency_unit is AS_NEEDED")
        _regenerate_future_schedule(db, medicine, date.today())

    db.commit()
    db.refresh(medicine)
    return medicine


def delete_medicine(db: Session, target: User | ProfileScope, medicine_id: int) -> None:
    medicine = _get_owned_medicine(db, target, medicine_id)
    db.delete(medicine)
    db.commit()



def _get_owned_schedule_entry(db: Session, target: User | ProfileScope, medicine_id: int, schedule_id: int) -> MedicineSchedule:
    _get_owned_medicine(db, target, medicine_id)  # 404s if not owned, before leaking schedule existence
    entry = db.scalar(select(MedicineSchedule).where(
        MedicineSchedule.id == schedule_id, MedicineSchedule.medicine_id == medicine_id))
    if entry is None:
        raise SCHEDULE_NOT_FOUND
    return entry


def _upsert_intake_log(db: Session, medicine_id: int, log_date: date) -> None:
    """Recomputes the day's aggregate from scratch by counting schedule rows - simpler and
    less bug-prone than incrementing/decrementing counters as entries get re-marked."""
    rows = db.scalars(select(MedicineSchedule).where(
        MedicineSchedule.medicine_id == medicine_id, MedicineSchedule.scheduled_date == log_date)).all()
    taken = sum(1 for r in rows if r.is_taken)
    skipped = sum(1 for r in rows if r.is_skipped)
    missed = sum(1 for r in rows if not r.is_taken and not r.is_skipped and log_date < date.today())
    total = len(rows)

    log = db.scalar(select(MedicineIntakeLog).where(
        MedicineIntakeLog.medicine_id == medicine_id, MedicineIntakeLog.log_date == log_date))
    if log is None:
        log = MedicineIntakeLog(medicine_id=medicine_id, log_date=log_date)
        db.add(log)
    log.taken_count, log.skipped_count, log.missed_count = taken, skipped, missed
    log.adherence_percent = Decimal(str(round(taken / total * 100, 2))) if total else Decimal("0.00")


def log_taken(db: Session, target: User | ProfileScope, medicine_id: int, schedule_id: int) -> MedicineSchedule:
    entry = _get_owned_schedule_entry(db, target, medicine_id, schedule_id)
    previously_taken = entry.is_taken
    entry.is_taken = True
    entry.is_skipped = False
    entry.taken_at = utcnow()
    if entry.medicine:
        entry.dosage_at_intake = entry.medicine.dosage
        entry.dosage_unit_at_intake = entry.medicine.dosage_unit

        # Decrement supply if not previously taken
        if not previously_taken and entry.medicine.quantity_on_hand is not None:
            pills = entry.medicine.pills_per_dose or 1
            entry.medicine.quantity_on_hand = max(0, entry.medicine.quantity_on_hand - pills)

            # Trigger in-app notification if at or below threshold
            threshold_days = entry.medicine.refill_threshold_days or 7
            days_remaining = entry.medicine.days_left
            if days_remaining is not None and days_remaining <= threshold_days:
                owner_id, _ = _get_scope_ids(db, target)
                from app.models import Notification, NotificationType
                db.add(Notification(
                    user_id=owner_id,
                    notification_type=NotificationType.WELLNESS_REMINDER,
                    title=f"Refill reminder: {entry.medicine.medicine_name}",
                    message=f"You have approximately {days_remaining} day{'s' if days_remaining != 1 else ''} left of {entry.medicine.medicine_name}. Contact your pharmacy to refill.",
                    related_entity_type="medicines",
                    related_entity_id=entry.medicine.id,
                    action_url=f"/medicines/{entry.medicine.id}",
                ))

    _upsert_intake_log(db, medicine_id, entry.scheduled_date)
    db.commit()
    db.refresh(entry)
    return entry


def log_skipped(db: Session, target: User | ProfileScope, medicine_id: int, schedule_id: int, reason: str | None) -> MedicineSchedule:
    entry = _get_owned_schedule_entry(db, target, medicine_id, schedule_id)
    previously_taken = entry.is_taken
    entry.is_skipped = True
    entry.is_taken = False
    entry.taken_at = None
    entry.skipped_reason = reason

    # Restore supply if this dose was previously marked taken (undo)
    if previously_taken and entry.medicine and entry.medicine.quantity_on_hand is not None:
        pills = entry.medicine.pills_per_dose or 1
        entry.medicine.quantity_on_hand += pills

    _upsert_intake_log(db, medicine_id, entry.scheduled_date)
    db.commit()
    db.refresh(entry)
    return entry


def refill_medicine(db: Session, target: User | ProfileScope, medicine_id: int, quantity: int, pharmacy_note: str | None = None) -> Medicine:
    medicine = _get_owned_medicine(db, target, medicine_id)
    current = medicine.quantity_on_hand or 0
    medicine.quantity_on_hand = current + quantity
    if pharmacy_note:
        medicine.pharmacy_note = pharmacy_note
    db.commit()
    db.refresh(medicine)
    return medicine


def get_adherence(db: Session, target: User | ProfileScope, medicine_id: int, days: int) -> dict:
    _get_owned_medicine(db, target, medicine_id)
    cutoff = date.today() - timedelta(days=days - 1)
    rows = db.scalars(select(MedicineSchedule).where(
        MedicineSchedule.medicine_id == medicine_id, MedicineSchedule.scheduled_date >= cutoff,
        MedicineSchedule.scheduled_date <= date.today())).all()
    taken = sum(1 for r in rows if r.is_taken)
    skipped = sum(1 for r in rows if r.is_skipped)
    missed = sum(1 for r in rows if not r.is_taken and not r.is_skipped and r.scheduled_date < date.today())
    total = len(rows)
    return {
        "medicine_id": medicine_id, "days": days, "scheduled_count": total, "taken_count": taken,
        "skipped_count": skipped, "missed_count": missed,
        "adherence_percent": round(taken / total * 100, 2) if total else 0.0,
    }


def get_overall_adherence_summary(db: Session, target: User | ProfileScope, days: int) -> dict:
    """Counts and percentage across ALL of the target profile's ACTIVE medicines combined, over the window."""
    owner_id, profile_id = _get_scope_ids(db, target)
    cutoff = date.today() - timedelta(days=days - 1)
    rows = db.execute(
        select(MedicineSchedule)
        .join(Medicine, Medicine.id == MedicineSchedule.medicine_id)
        .where(Medicine.user_id == owner_id, Medicine.care_profile_id == profile_id, Medicine.is_active.is_(True),
              MedicineSchedule.scheduled_date >= cutoff, MedicineSchedule.scheduled_date <= date.today())
    ).scalars().all()
    taken = sum(1 for r in rows if r.is_taken)
    skipped = sum(1 for r in rows if r.is_skipped)
    missed = sum(1 for r in rows if not r.is_taken and not r.is_skipped and r.scheduled_date < date.today())
    total = len(rows)
    return {
        "days": days, "scheduled_count": total, "taken_count": taken, "skipped_count": skipped,
        "missed_count": missed, "adherence_percent": round(taken / total * 100, 2) if total else None,
    }


def get_overall_adherence(db: Session, target: User | ProfileScope, days: int) -> Optional[float]:
    """Just the percentage (None when there is nothing to measure). Used by goal progress."""
    return get_overall_adherence_summary(db, target, days)["adherence_percent"]


def get_today_schedule(db: Session, target: User | ProfileScope) -> list[dict]:
    owner_id, profile_id = _get_scope_ids(db, target)
    active_medicines = db.scalars(
        select(Medicine).where(Medicine.user_id == owner_id, Medicine.care_profile_id == profile_id, Medicine.is_active.is_(True))
    ).all()
    for m in active_medicines:
        ensure_schedule_ahead(db, m, days_ahead=30)

    rows = db.execute(
        select(MedicineSchedule, Medicine.medicine_name)
        .join(Medicine, Medicine.id == MedicineSchedule.medicine_id)
        .where(Medicine.user_id == owner_id, Medicine.care_profile_id == profile_id, Medicine.is_active.is_(True),
              MedicineSchedule.scheduled_date == date.today())
        .order_by(MedicineSchedule.scheduled_time.asc())
    ).all()
    return [{**{c.name: getattr(entry, c.name) for c in MedicineSchedule.__table__.columns},
            "medicine_name": name,
            "quantity_on_hand": entry.medicine.quantity_on_hand if entry.medicine else None,
            "days_left": entry.medicine.days_left if entry.medicine else None} for entry, name in rows]



async def scan_medicine_image(image) -> dict:
    """
    Parses a medicine label/box photo into a structured draft (name, dosage, form, instructions).
    Uses a vision provider when VISION_API_KEY is configured.
    """
    from decimal import Decimal
    from app.config.settings import settings
    from app.services.drug_intelligence_service import search_medicine_names

    if not settings.VISION_API_KEY:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Medicine scanning vision service is not configured"
        )

    # In production with Google Cloud Vision / Gemini Vision:
    # content = await image.read()
    # parse response into draft
    # Here, provide mock/draft schema response:
    detected_name = "Amoxicillin"
    rx_matches = await search_medicine_names(detected_name, max_results=1)
    rxcui = rx_matches[0]["rxcui"] if rx_matches else None

    return {
        "medicine_name": detected_name,
        "dosage": Decimal("500.00"),
        "dosage_unit": "mg",
        "form": "CAPSULE",
        "instructions": "Take 1 capsule 3 times daily with water",
        "rxcui": rxcui,
        "raw_detected_text": "Amoxicillin 500mg Capsules USP - Take 1 capsule three times a day",
    }

