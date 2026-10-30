"""Unit tests for emergency card, symptom logging, and doctor appointments."""

from datetime import datetime, timezone
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config.database import Base
from app.models.emergency_and_symptoms import AppointmentStatus, DoctorAppointment, EmergencyCard, SymptomLog
from app.models.user import User, UserProfile, UserRole
from app.schemas.emergency_and_symptoms import (
    AppointmentCreate,
    AppointmentUpdate,
    EmergencyCardUpdate,
    SymptomLogCreate,
)
from app.services import emergency_service


@pytest.fixture
def memory_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    test_user = User(
        id=1,
        email="emergency_test@example.com",
        password_hash="fakehash",
        full_name="Alex River",
        role=UserRole.USER,
        is_active=True,
    )
    session.add(test_user)
    session.commit()

    yield session
    session.close()


def test_get_or_create_card(memory_db):
    card = emergency_service.get_or_create_card(memory_db, user_id=1)
    assert card is not None
    assert card.user_id == 1
    assert card.public_token is not None
    assert len(card.public_token) > 10
    assert card.is_public is False  # Private by default for user privacy


def test_update_card(memory_db):
    update_data = EmergencyCardUpdate(
        blood_type="O+",
        allergies=["Penicillin", "Peanuts"],
        chronic_conditions=["Asthma"],
        emergency_contact_name="Sarah River",
        emergency_contact_phone="+1-555-0199",
        emergency_contact_relationship="Spouse",
        organ_donor=True,
    )
    updated = emergency_service.update_card(memory_db, user_id=1, data=update_data)
    assert updated.blood_type == "O+"
    assert updated.allergies == ["Penicillin", "Peanuts"]
    assert updated.organ_donor is True
    assert updated.emergency_contact_name == "Sarah River"


def test_public_card_access(memory_db):
    card = emergency_service.get_or_create_card(memory_db, user_id=1)
    # Card is private by default — public lookup must NOT return it
    assert card.is_public is False
    private_result = emergency_service.get_public_card(memory_db, card.public_token)
    assert private_result is None

    # Make it explicitly public (with consent) — now it should be findable
    emergency_service.set_card_visibility(memory_db, user_id=1, is_public=True, consent_acknowledged=True)
    found = emergency_service.get_public_card(memory_db, card.public_token)
    assert found is not None
    assert found.id == card.id

    # Nonexistent token
    missing = emergency_service.get_public_card(memory_db, "nonexistent-token-xyz")
    assert missing is None

    # Revoke public access — card should disappear from public lookup
    emergency_service.set_card_visibility(memory_db, user_id=1, is_public=False)
    revoked = emergency_service.get_public_card(memory_db, card.public_token)
    assert revoked is None


def test_log_and_list_symptoms(memory_db):
    log1 = emergency_service.log_symptom(
        memory_db,
        user_id=1,
        data=SymptomLogCreate(symptom_name="Mild Headache", severity=2, notes="After working on screen"),
    )
    assert log1.id is not None
    assert log1.symptom_name == "Mild Headache"
    assert log1.severity == 2

    log2 = emergency_service.log_symptom(
        memory_db,
        user_id=1,
        data=SymptomLogCreate(symptom_name="Fatigue", severity=3, notes="Low sleep"),
    )
    assert log2.id is not None

    symptoms = emergency_service.list_symptoms(memory_db, user_id=1, days=7)
    assert len(symptoms) == 2
    assert symptoms[0].symptom_name == "Fatigue"  # newest first


def test_appointments_lifecycle(memory_db):
    appt = emergency_service.create_appointment(
        memory_db,
        user_id=1,
        data=AppointmentCreate(
            doctor_name="Dr. Jane Smith",
            specialty="Cardiologist",
            location="Heart & Vascular Clinic, Suite 300",
            appointment_date=datetime(2026, 11, 15, 10, 30, tzinfo=timezone.utc),
            reason_for_visit="Annual cardiovascular checkup",
            questions_to_ask=["Should I adjust my blood pressure medicine dose?", "Is morning exercise better?"],
        ),
    )
    assert appt.id is not None
    assert appt.doctor_name == "Dr. Jane Smith"
    assert appt.status == AppointmentStatus.UPCOMING

    # List appointments
    appts = emergency_service.list_appointments(memory_db, user_id=1)
    assert len(appts) == 1

    # Update appointment
    updated = emergency_service.update_appointment(
        memory_db,
        user_id=1,
        appt_id=appt.id,
        data=AppointmentUpdate(status=AppointmentStatus.COMPLETED),
    )
    assert updated.status == AppointmentStatus.COMPLETED

    # Delete appointment
    deleted = emergency_service.delete_appointment(memory_db, user_id=1, appt_id=appt.id)
    assert deleted is True
    assert len(emergency_service.list_appointments(memory_db, user_id=1)) == 0
