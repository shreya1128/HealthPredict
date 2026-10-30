#!/usr/bin/env python
"""Create development accounts (admin + demo user) and optionally populate realistic demo data.

Passwords are read from the environment (ADMIN_PASSWORD / DEMO_PASSWORD) so no credentials live in
source control. The script refuses to run in production and never overwrites existing accounts.

    ADMIN_PASSWORD='...' DEMO_PASSWORD='...' SEED_DEMO_DATA=true python seed_data.py
"""

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
import secrets
import sys

from sqlalchemy import select

from app.config.database import SessionLocal
from app.config.settings import settings
from app.models import (
    AppointmentStatus, CareProfile, CaregiverAccess, CaregiverAccessLevel, CaregiverInviteStatus,
    DoctorAppointment, DoctorShare, EmergencyCard, ExerciseLog, HealthAssessment, HealthHistory,
    HydrationLog, Intensity, Medicine, MedicineForm, MedicineSchedule, MealType, NutritionLog,
    RelationshipType, SleepLog, SymptomLog, User, UserProfile, UserRole, WellnessGoal,
)
from app.models.tracking import GoalStatus, GoalType
from app.schemas.auth import validate_password_strength
from app.utils.security import hash_password


def seed_user(db, email: str, password: str, name: str, role: str) -> tuple[User, str]:
    existing = db.scalar(select(User).where(User.email == email.lower()))
    if existing:
        return existing, "exists (left unchanged)"
    user = User(email=email.lower(), password_hash=hash_password(password), full_name=name,
                role=role, is_active=True, email_verified=True)
    user.profile = UserProfile()
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, "created"


def seed_realistic_demo_history(db, user: User):
    """Generates 60 days of realistic history for the demo account when SEED_DEMO_DATA is true."""
    today = date.today()
    now_utc = datetime.now(timezone.utc)

    # 1. Update Profile
    profile = user.profile
    if not profile:
        profile = UserProfile(user_id=user.id)
        db.add(profile)
    profile.height_cm = Decimal("175.00")
    profile.weight_kg = Decimal("74.50")
    profile.exercise_frequency = "ACTIVE"
    profile.smoking_status = "NEVER"
    profile.alcohol_consumption = "OCCASIONALLY"
    profile.allergies = ["Penicillin"]
    profile.existing_conditions = ["Mild Hypertension"]

    # 2. Add 4 realistic medicines with supply tracking
    meds_data = [
        {"name": "Lisinopril", "dosage": Decimal("10.00"), "unit": "mg", "form": MedicineForm.TABLET, "times": ["08:00"], "reason": "Blood pressure management", "qty": 45, "pills": 1, "thresh": 7},
        {"name": "Metformin", "dosage": Decimal("500.00"), "unit": "mg", "form": MedicineForm.TABLET, "times": ["08:00", "20:00"], "reason": "Blood glucose regulation", "qty": 60, "pills": 1, "thresh": 7},
        {"name": "Atorvastatin", "dosage": Decimal("20.00"), "unit": "mg", "form": MedicineForm.TABLET, "times": ["21:00"], "reason": "Cholesterol management", "qty": 18, "pills": 1, "thresh": 5},
        {"name": "Vitamin D3", "dosage": Decimal("1000.00"), "unit": "IU", "form": MedicineForm.CAPSULE, "times": ["09:00"], "reason": "Daily wellness supplement", "qty": 80, "pills": 1, "thresh": 10},
    ]

    created_meds = []
    for md in meds_data:
        existing_med = db.scalar(select(Medicine).where(Medicine.user_id == user.id, Medicine.medicine_name == md["name"]))
        if not existing_med:
            m = Medicine(
                user_id=user.id, medicine_name=md["name"], dosage=md["dosage"], dosage_unit=md["unit"],
                form=md["form"], frequency=len(md["times"]), frequency_unit="DAILY",
                start_date=today - timedelta(days=60), time_of_day=md["times"],
                instructions="Take with a full glass of water", reason_for_use=md["reason"],
                quantity_on_hand=md["qty"], pills_per_dose=md["pills"], refill_threshold_days=md["thresh"],
                is_active=True,
            )
            db.add(m)
            db.flush()
            created_meds.append(m)
        else:
            created_meds.append(existing_med)

    # 3. Schedule history for past 60 days
    for med in created_meds:
        existing_sched_count = db.scalar(select(MedicineSchedule.id).where(MedicineSchedule.medicine_id == med.id).limit(1))
        if not existing_sched_count:
            for day_offset in range(60, -1, -1):
                sch_date = today - timedelta(days=day_offset)
                for t_str in (med.time_of_day or ["08:00"]):
                    h, m_val = map(int, t_str.split(":"))
                    sch_time = time(h, m_val)
                    is_taken = day_offset > 0 or sch_time < datetime.now().time()
                    taken_ts = datetime.combine(sch_date, sch_time, tzinfo=timezone.utc) if is_taken else None
                    db.add(MedicineSchedule(
                        medicine_id=med.id, scheduled_date=sch_date, scheduled_time=sch_time,
                        is_taken=is_taken, is_skipped=False, taken_at=taken_ts,
                        dosage_at_intake=med.dosage, dosage_unit_at_intake=med.dosage_unit,
                    ))

    # 4. 60 days of Vitals & Health History
    for day_offset in range(60, -1, -1):
        cur_date = today - timedelta(days=day_offset)
        if not db.scalar(select(HealthHistory.id).where(HealthHistory.user_id == user.id, HealthHistory.tracking_date == cur_date)):
            bp_sys = 118 + (day_offset % 7)
            bp_dia = 76 + (day_offset % 5)
            hr = 68 + (day_offset % 8)
            glucose = 92 + (day_offset % 10)
            score = Decimal("85.00") + Decimal(str((day_offset % 5) * 1.5))
            db.add(HealthHistory(
                user_id=user.id, tracking_date=cur_date, health_score=score,
                weight_kg=Decimal("74.50"), bmi=Decimal("24.33"), systolic_bp=bp_sys,
                diastolic_bp=bp_dia, heart_rate_bpm=hr, blood_glucose_mg_dl=glucose,
                spo2_percent=Decimal("98.50"), risk_category="LOW",
            ))

    # 5. Weekly/Bi-weekly Assessments
    for day_offset in [50, 35, 21, 7]:
        cur_date = today - timedelta(days=day_offset)
        if not db.scalar(select(HealthAssessment.id).where(HealthAssessment.user_id == user.id, HealthAssessment.assessment_date == cur_date)):
            db.add(HealthAssessment(
                user_id=user.id, assessment_date=cur_date, systolic_bp=120, diastolic_bp=78,
                heart_rate_bpm=72, blood_glucose_mg_dl=95, spo2_percent=Decimal("98.50"),
                temperature_celsius=Decimal("36.60"), health_score=Decimal("88.00"),
                risk_category="LOW", data_completeness_percent=Decimal("100.00"),
                status="COMPLETED",
            ))

    # 6. Sleep, Hydration & Exercise Logs
    for day_offset in range(30, -1, -1):
        cur_date = today - timedelta(days=day_offset)
        # Sleep
        if not db.scalar(select(SleepLog.id).where(SleepLog.user_id == user.id, SleepLog.sleep_date == cur_date)):
            db.add(SleepLog(
                user_id=user.id, sleep_date=cur_date, bedtime=time(23, 0), wake_time=time(7, 15),
                sleep_duration_hours=Decimal("8.25"), sleep_quality=4, notes="Restful sleep",
            ))
        # Hydration
        if not db.scalar(select(HydrationLog.id).where(HydrationLog.user_id == user.id, HydrationLog.hydration_date == cur_date)):
            db.add(HydrationLog(user_id=user.id, hydration_date=cur_date, water_intake_ml=2250))
        # Exercise (every 2 days)
        if day_offset % 2 == 0 and not db.scalar(select(ExerciseLog.id).where(ExerciseLog.user_id == user.id, ExerciseLog.exercise_date == cur_date)):
            db.add(ExerciseLog(
                user_id=user.id, exercise_date=cur_date, exercise_type="Brisk Walking",
                duration_minutes=35, intensity=Intensity.MODERATE, calories_burned=160,
                distance_km=Decimal("3.20"),
            ))

    # 7. Goals
    if not db.scalar(select(WellnessGoal.id).where(WellnessGoal.user_id == user.id)):
        db.add(WellnessGoal(
            user_id=user.id, goal_type=GoalType.EXERCISE, goal_description="Walk 30 mins 4x weekly",
            target_value=Decimal("120.00"), unit="mins",
            status=GoalStatus.ACTIVE, start_date=today, end_date=today + timedelta(days=14),
        ))
        db.add(WellnessGoal(
            user_id=user.id, goal_type=GoalType.HYDRATION, goal_description="Drink 2.5L water daily",
            target_value=Decimal("2500.00"), unit="ml",
            status=GoalStatus.ACTIVE, start_date=today, end_date=today + timedelta(days=30),
        ))

    # 8. Upcoming Doctor Appointment
    if not db.scalar(select(DoctorAppointment.id).where(DoctorAppointment.user_id == user.id)):
        db.add(DoctorAppointment(
            user_id=user.id, doctor_name="Dr. Eleanor Vance", specialty="Cardiology",
            location="Health Center Suite 402", appointment_date=now_utc + timedelta(days=12),
            reason_for_visit="Annual blood pressure review and prescription renewal",
            status=AppointmentStatus.UPCOMING,
        ))

    # 9. Emergency Card
    if not db.scalar(select(EmergencyCard.id).where(EmergencyCard.user_id == user.id)):
        db.add(EmergencyCard(
            user_id=user.id, public_token=secrets.token_urlsafe(32), blood_type="O+",
            allergies=["Penicillin"], chronic_conditions=["Mild Hypertension"],
            current_medications=["Lisinopril 10mg", "Metformin 500mg"],
            emergency_contact_name="Sarah Miller", emergency_contact_phone="+1-555-0192",
            emergency_contact_relationship="Spouse", organ_donor=True,
            medical_notes="Regular checkups up to date. Carries emergency contact details.",
            is_public=False,
        ))

    # 10. Family member (CareProfile)
    if not db.scalar(select(CareProfile.id).where(CareProfile.account_owner_id == user.id)):
        db.add(CareProfile(
            account_owner_id=user.id, full_name="Robert Miller", relationship=RelationshipType.PARENT,
            date_of_birth=date(1952, 4, 15), gender="MALE", avatar_color="#0f766e",
        ))

    # 11. Doctor Share with Physician Note
    if not db.scalar(select(DoctorShare.id).where(DoctorShare.user_id == user.id)):
        db.add(DoctorShare(
            user_id=user.id, token=secrets.token_urlsafe(32), days_range=30,
            doctor_name="Dr. Eleanor Vance",
            doctor_notes="Blood pressure remains well-controlled with Lisinopril. Continue current daily dosage.",
            doctor_reviewed_at=now_utc - timedelta(days=5),
            expires_at=now_utc + timedelta(days=25),
        ))

    db.commit()


def main() -> int:
    if settings.ENVIRONMENT == "production":
        print("Refusing to seed demo accounts in production.")
        return 1
    accounts = [
        (settings.ADMIN_EMAIL, settings.ADMIN_PASSWORD, "Admin User", UserRole.ADMIN, "ADMIN_PASSWORD"),
        (settings.DEMO_EMAIL, settings.DEMO_PASSWORD, "Demo User", UserRole.USER, "DEMO_PASSWORD"),
    ]
    for email, password, _n, _r, var in accounts:
        if not password:
            print(f"Set {var} in the environment or .env before seeding.")
            return 1
        try:
            validate_password_strength(password)
        except ValueError as exc:
            print(f"{var} is too weak: {exc}")
            return 1

    with SessionLocal() as db:
        for email, password, name, role, _var in accounts:
            user, msg = seed_user(db, email, password, name, role)
            print(f"{role:5} {email}: {msg}")
            if role == UserRole.USER and (settings.SEED_DEMO_DATA or "--with-data" in sys.argv):
                seed_realistic_demo_history(db, user)
                print(f"      Populated 60-day demo history for {email}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
