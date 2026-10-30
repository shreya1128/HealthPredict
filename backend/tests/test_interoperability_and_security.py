from datetime import date, datetime, timedelta, timezone
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config.database import Base
from app.models.doctor_share import DoctorShare
from app.models.health import HealthAssessment, RiskCategory
from app.models.medicine import Medicine
from app.models.token_blocklist import TokenBlocklist
from app.models.user import User, UserProfile
from app.services import doctor_summary_service, fhir_service
from app.utils.rate_limiter import RateLimiter
from app.utils.security import create_access_token, decode_access_token


@pytest.fixture
def memory_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_token_blocklist_revocation(memory_db):
    db = memory_db
    user = User(email="revoketest@example.com", password_hash="dummy", full_name="Revoke Tester")
    db.add(user)
    db.commit()

    token_str, _ = create_access_token(user.id, "USER")
    payload = decode_access_token(token_str)
    assert payload is not None
    jti = payload["jti"]
    assert jti

    assert TokenBlocklist.is_revoked(db, jti) is False

    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    TokenBlocklist.revoke(db, jti=jti, user_id=user.id, expires_at=exp)

    assert TokenBlocklist.is_revoked(db, jti) is True
    assert TokenBlocklist.is_revoked(db, "non-existent-jti") is False


def test_fhir_r4_document_bundle(memory_db):
    db = memory_db
    user = User(
        email="fhirpatient@example.com",
        password_hash="dummy",
        full_name="Alex River",
        date_of_birth=date(1990, 5, 12),
        gender="MALE",
        phone="+1234567890",
    )
    db.add(user)
    db.commit()

    # Add medicine
    med = Medicine(
        user_id=user.id,
        name="Lisinopril",
        dosage=10.0,
        dosage_unit="mg",
        frequency_times_per_day=1,
        start_date=date(2026, 1, 1),
        is_active=True,
    )
    db.add(med)

    # Add health assessment
    assessment = HealthAssessment(
        user_id=user.id,
        assessment_date=date(2026, 10, 1),
        systolic_bp=125,
        diastolic_bp=82,
        heart_rate_bpm=72,
        blood_glucose_mg_dl=98,
        spo2_percent=98.5,
        health_score=85,
        risk_category=RiskCategory.LOW,
    )
    db.add(assessment)
    db.commit()

    bundle = fhir_service.generate_fhir_r4_bundle(db, user)

    assert bundle["resourceType"] == "Bundle"
    assert bundle["type"] == "document"
    assert "timestamp" in bundle
    assert len(bundle["entry"]) >= 4

    # Composition must be first entry
    comp_res = bundle["entry"][0]["resource"]
    assert comp_res["resourceType"] == "Composition"
    assert comp_res["status"] == "final"
    assert comp_res["subject"]["display"] == "Alex River"

    # Patient resource must be present
    patient_res = bundle["entry"][1]["resource"]
    assert patient_res["resourceType"] == "Patient"
    assert patient_res["gender"] == "male"
    assert patient_res["name"][0]["text"] == "Alex River"

    # Resources in entry list
    resource_types = [e["resource"]["resourceType"] for e in bundle["entry"]]
    assert "Observation" in resource_types
    assert "MedicationStatement" in resource_types
    assert "Condition" in resource_types

    # Find BP observation
    bp_obs = next(
        e["resource"] for e in bundle["entry"]
        if e["resource"]["resourceType"] == "Observation" and e["resource"]["code"]["text"] == "Blood Pressure"
    )
    assert len(bp_obs["component"]) == 2
    assert bp_obs["component"][0]["valueQuantity"]["value"] == 125.0
    assert bp_obs["component"][1]["valueQuantity"]["value"] == 82.0


def test_doctor_summary_writeback_and_review(memory_db):
    db = memory_db
    user = User(email="sharedoc@example.com", password_hash="dummy", full_name="Patient Casey")
    db.add(user)
    db.commit()

    share = doctor_summary_service.create_share_link(
        db, user=user, days_range=30, questions=["Can I reduce dosage?"], expire_days=7
    )
    assert share.token
    assert share.is_valid() is True

    # Doctor views public summary
    summary = doctor_summary_service.get_public_doctor_summary(db, share.token)
    assert summary["patient_name"] == "Patient Casey"
    assert summary["questions_for_doctor"] == ["Can I reduce dosage?"]
    assert summary["doctor_review"]["doctor_name"] is None

    # Doctor submits write-back notes (returned as external unverified notes)
    res = doctor_summary_service.submit_doctor_notes(
        db=db,
        token=share.token,
        doctor_name="Dr. Gregory House",
        doctor_notes="Patient shows steady progress. Maintain current dosage.",
        doctor_recommendations=["Hydrate regularly", "Schedule checkup in 3 months"],
    )
    assert res["author_name"] == "Dr. Gregory House"
    assert res["is_unverified"] is True
    assert "External note (unverified)" in res["note_text"]

    # Check updated summary — doctor_review on the share itself is NOT updated
    # (external notes don't write to the share's official review fields)
    updated_summary = doctor_summary_service.get_public_doctor_summary(db, share.token)
    # External notes appear in the notes list, not in doctor_review
    assert updated_summary["doctor_review"]["doctor_name"] is None
    notes_list = updated_summary.get("notes", [])
    assert any("Maintain current dosage" in n.get("note_text", "") for n in notes_list)


def test_rate_limiter_local_sliding_window():
    limiter = RateLimiter(limit=3, window_seconds=60)
    limiter.reset()

    # 3 hits should pass
    limiter.check("test-client")
    limiter.check("test-client")
    limiter.check("test-client")

    # 4th hit in window raises 429
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as excinfo:
        limiter.check("test-client")
    assert excinfo.value.status_code == 429

    # Reset clears hits
    limiter.reset()
    limiter.check("test-client")
