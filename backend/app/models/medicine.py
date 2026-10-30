"""Medicine models. Mirror database/schema.sql exactly."""

from sqlalchemy import (
    JSON, Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, SmallInteger, String, Text, Time,
)
from sqlalchemy.orm import relationship

from app.config.database import Base
from app.models.user import PK
from app.utils.timeutil import utcnow


class MedicineForm:
    TABLET = "TABLET"; CAPSULE = "CAPSULE"; LIQUID = "LIQUID"
    INJECTION = "INJECTION"; PATCH = "PATCH"; OTHER = "OTHER"


class FrequencyUnit:
    DAILY = "DAILY"; WEEKLY = "WEEKLY"; MONTHLY = "MONTHLY"; AS_NEEDED = "AS_NEEDED"


class Medicine(Base):
    __tablename__ = "medicines"

    id = Column(PK, primary_key=True, autoincrement=True)
    user_id = Column(PK, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    care_profile_id = Column(PK, ForeignKey("care_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    medicine_name = Column(String(255), nullable=False)
    dosage = Column(Numeric(10, 2))
    dosage_unit = Column(String(50))
    form = Column(String(20), default=MedicineForm.TABLET)
    frequency = Column(Integer, default=1)
    frequency_unit = Column(String(15), default=FrequencyUnit.DAILY)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date)
    time_of_day = Column(JSON)  # list of "HH:MM" strings
    # Complex weekly cadence: list of ISO weekday ints (0=Mon .. 6=Sun), e.g. [0,2,4] = Mon/Wed/Fri.
    # When set for WEEKLY medicines, doses are generated on these specific weekdays.
    weekdays = Column(JSON)  # list of ints 0-6
    # Complex monthly cadence: specific calendar day-of-month (1-31).
    # When set for MONTHLY medicines, doses are generated on this calendar day each month.
    month_day = Column(SmallInteger)
    instructions = Column(Text)
    reason_for_use = Column(String(255))
    notes = Column(Text)
    rxcui = Column(String(50))
    quantity_on_hand = Column(Integer)
    pills_per_dose = Column(Integer, default=1)
    refill_threshold_days = Column(Integer, default=7)
    pharmacy_note = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="medicines")
    schedules = relationship("MedicineSchedule", back_populates="medicine", cascade="all, delete-orphan")
    intake_logs = relationship("MedicineIntakeLog", back_populates="medicine", cascade="all, delete-orphan")

    @property
    def name(self) -> str:
        return self.medicine_name

    @name.setter
    def name(self, val: str) -> None:
        self.medicine_name = val

    @property
    def frequency_times_per_day(self) -> int:
        return self.frequency or 1

    @frequency_times_per_day.setter
    def frequency_times_per_day(self, val: int) -> None:
        self.frequency = val

    @property
    def days_left(self) -> int | None:
        if self.quantity_on_hand is None:
            return None
        pills_per_day = (self.frequency or 1) * (self.pills_per_dose or 1)
        if pills_per_day <= 0:
            return None
        return max(0, self.quantity_on_hand // pills_per_day)


class DrugInteractionCache(Base):
    __tablename__ = "drug_interaction_cache"

    id = Column(PK, primary_key=True, autoincrement=True)
    drug_a_rxcui = Column(String(50), index=True)
    drug_b_rxcui = Column(String(50), index=True)
    drug_a_name = Column(String(255), nullable=False)
    drug_b_name = Column(String(255), nullable=False)
    severity = Column(String(50), default="MODERATE", nullable=False)
    description = Column(Text, nullable=False)
    source = Column(String(100), default="openfda", nullable=False)
    cached_at = Column(DateTime, default=utcnow)



class MedicineSchedule(Base):
    __tablename__ = "medicine_schedules"

    id = Column(PK, primary_key=True, autoincrement=True)
    medicine_id = Column(PK, ForeignKey("medicines.id", ondelete="CASCADE"), nullable=False)
    scheduled_date = Column(Date, nullable=False)
    scheduled_time = Column(Time)
    is_taken = Column(Boolean, default=False)
    is_skipped = Column(Boolean, default=False)
    taken_at = Column(DateTime)
    skipped_reason = Column(String(255))
    # Dosage snapshot at time of intake - preserves historical dosage even if medicine dosage is later changed.
    dosage_at_intake = Column(Numeric(10, 2))
    dosage_unit_at_intake = Column(String(50))
    notes = Column(Text)
    created_at = Column(DateTime, default=utcnow)

    medicine = relationship("Medicine", back_populates="schedules")

    @property
    def medicine_name(self) -> str | None:
        return self.medicine.medicine_name if self.medicine else None

    @property
    def dosage(self):
        return self.dosage_at_intake or (self.medicine.dosage if self.medicine else None)

    @property
    def dosage_unit(self) -> str | None:
        return self.dosage_unit_at_intake or (self.medicine.dosage_unit if self.medicine else None)

    @property
    def quantity_on_hand(self) -> int | None:
        return self.medicine.quantity_on_hand if self.medicine else None

    @property
    def days_left(self) -> int | None:
        return self.medicine.days_left if self.medicine else None


class MedicineIntakeLog(Base):
    """Daily aggregate per medicine - upserted whenever a schedule entry is marked taken/skipped,
    so adherence queries don't need to re-scan every schedule row."""

    __tablename__ = "medicine_intake_logs"

    id = Column(PK, primary_key=True, autoincrement=True)
    medicine_id = Column(PK, ForeignKey("medicines.id", ondelete="CASCADE"), nullable=False)
    log_date = Column(Date, nullable=False)
    taken_count = Column(Integer, default=0)
    skipped_count = Column(Integer, default=0)
    missed_count = Column(Integer, default=0)
    adherence_percent = Column(Numeric(5, 2))
    notes = Column(Text)
    created_at = Column(DateTime, default=utcnow)

    medicine = relationship("Medicine", back_populates="intake_logs")
