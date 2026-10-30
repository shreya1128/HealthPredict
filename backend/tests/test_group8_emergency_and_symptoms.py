"""Group 8 Automated Integration Tests: Emergency Card & Symptoms.

Covers:
- E1: Offline Emergency Card & QR code (vector SVG generation, public endpoint with rate limiting / visibility toggle)
- E2: Symptom Frequency & Intensity Tracker (frequency, severity, progression trends, timeline scoped by care profile)
- E3: Doctor Appointment Preparation & Questions (pre-visit checklist, active meds, 14-day symptoms, notes & followup date)
"""

from datetime import date, datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config.database import SessionLocal
from app.main import app
from app.models.care_profile import CareProfile
from app.models.emergency_and_symptoms import DoctorAppointment, EmergencyCard, SymptomLog
from app.models.health import HealthAssessment
from app.models.medicine import Medicine
from app.models.user import User


@pytest.fixture
def test_user(db: Session):
    """Fixture providing a primary test user."""
    email = f"group8_user_{datetime.now().timestamp()}@example.com"
    user = User(
        email=email,
        password_hash="hashed_pw_group8",
        full_name="Morgan Chase",
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
# E1: EMERGENCY MEDICAL ID CARD & QR CODE TESTS
# ============================================================================

def test_emergency_card_crud_and_svg_qr(test_user: User, auth_headers: dict):
    client = TestClient(app)

    # 1. Update/Create Emergency Card
    payload = {
        "blood_type": "O+",
        "allergies": ["Penicillin", "Peanuts"],
        "chronic_conditions": ["Hypertension"],
        "emergency_contact_name": "Jane Chase",
        "emergency_contact_phone": "555-0199",
        "emergency_contact_relationship": "Spouse",
        "organ_donor": True,
        "is_public": True,
        "consent_acknowledged": True,
    }
    res = client.put("/api/health/emergency-card", json=payload, headers=auth_headers)
    assert res.status_code == 200, res.text
    card_data = res.json()
    assert card_data["blood_type"] == "O+"
    assert card_data["public_token"] is not None
    token = card_data["public_token"]

    # 2. Authenticated QR Code SVG endpoint
    res_qr = client.get("/api/health/emergency-card/qr", headers=auth_headers)
    assert res_qr.status_code == 200
    assert "image/svg+xml" in res_qr.headers["content-type"]
    assert "<svg" in res_qr.text
    assert "</svg>" in res_qr.text

    # 3. Public QR Code SVG endpoint (unauthenticated)
    res_pub_qr = client.get(f"/api/health/emergency-card/public/{token}/qr")
    assert res_pub_qr.status_code == 200
    assert "image/svg+xml" in res_pub_qr.headers["content-type"]
    assert "<svg" in res_pub_qr.text

    # 4. Public View
    res_pub = client.get(f"/api/health/emergency-card/public/{token}")
    assert res_pub.status_code == 200
    assert res_pub.json()["blood_type"] == "O+"

    # 5. Disable public visibility -> Public view returns 404
    client.put("/api/health/emergency-card", json={"is_public": False}, headers=auth_headers)
    res_pub_hidden = client.get(f"/api/health/emergency-card/public/{token}")
    assert res_pub_hidden.status_code == 404


# ============================================================================
# E2: SYMPTOM FREQUENCY & INTENSITY TRACKER TESTS
# ============================================================================

def test_symptom_frequency_and_analytics(test_user: User, auth_headers: dict, db: Session):
    client = TestClient(app)

    today = date.today()
    # Log multiple symptoms across several days (severity 1 to 5)
    logs = [
        SymptomLog(user_id=test_user.id, symptom_name="Migraine", severity=3, logged_at=datetime.combine(today - timedelta(days=5), datetime.min.time())),
        SymptomLog(user_id=test_user.id, symptom_name="Migraine", severity=4, logged_at=datetime.combine(today - timedelta(days=2), datetime.min.time())),
        SymptomLog(user_id=test_user.id, symptom_name="Migraine", severity=5, logged_at=datetime.combine(today, datetime.min.time())),
        SymptomLog(user_id=test_user.id, symptom_name="Nausea", severity=2, logged_at=datetime.combine(today - timedelta(days=3), datetime.min.time())),
    ]
    db.add_all(logs)
    db.commit()

    res = client.get("/api/health/symptoms/analytics?days=30", headers=auth_headers)
    assert res.status_code == 200, res.text
    analytics = res.json()

    assert analytics["total_logs"] == 4
    assert analytics["days_analyzed"] == 30
    assert len(analytics["symptom_breakdown"]) >= 2

    migraine_stat = next(s for s in analytics["symptom_breakdown"] if s["symptom_name"] == "Migraine")
    assert migraine_stat["frequency"] == 3
    assert migraine_stat["max_severity"] == 5
    assert migraine_stat["average_severity"] == 4.0
    assert migraine_stat["trend"] == "INCREASING"

    # Verify timeline distribution points
    assert len(analytics["timeline"]) >= 3


# ============================================================================
# E3: DOCTOR APPOINTMENT PREPARATION & QUESTIONS TESTS
# ============================================================================

def test_appointment_prep_sheet_and_doctor_notes(test_user: User, auth_headers: dict, db: Session):
    client = TestClient(app)

    today = date.today()

    # 1. Add active medicine
    med = Medicine(
        user_id=test_user.id,
        medicine_name="Lisinopril",
        dosage=10.0,
        dosage_unit="mg",
        start_date=today - timedelta(days=30),
        is_active=True,
    )
    # 2. Add recent symptom
    symptom = SymptomLog(
        user_id=test_user.id,
        symptom_name="Dizziness",
        severity=3,
        logged_at=datetime.combine(today - timedelta(days=2), datetime.min.time()),
    )
    # 3. Add health assessment
    assessment = HealthAssessment(
        user_id=test_user.id,
        assessment_date=today,
        health_score=42.5,
        risk_category="MODERATE",
    )
    db.add_all([med, symptom, assessment])
    db.commit()

    # 4. Create Doctor Appointment with followup date and doctor notes
    appt_payload = {
        "doctor_name": "Dr. Sarah Adams",
        "specialty": "Cardiology",
        "appointment_date": datetime.combine(today + timedelta(days=3), datetime.min.time()).isoformat(),
        "reason_for_visit": "Annual checkup",
        "doctor_notes": "Patient reported mild dizziness on standing. Ordered ambulatory BP monitoring.",
        "followup_date": str(today + timedelta(days=30)),
    }
    res_create = client.post("/api/health/appointments", json=appt_payload, headers=auth_headers)
    assert res_create.status_code == 201, res_create.text
    appt = res_create.json()
    appt_id = appt["id"]
    assert appt["doctor_notes"] == appt_payload["doctor_notes"]
    assert appt["followup_date"] == appt_payload["followup_date"]

    # 5. Fetch Appointment Prep Sheet
    res_prep = client.get(f"/api/health/appointments/{appt_id}/prep", headers=auth_headers)
    assert res_prep.status_code == 200, res_prep.text
    prep = res_prep.json()

    assert prep["appointment"]["id"] == appt_id
    assert prep["appointment"]["doctor_name"] == "Dr. Sarah Adams"
    # Active meds populated
    assert any(m["medicine_name"] == "Lisinopril" for m in prep["active_medications"])
    # Recent symptoms populated
    assert any(s["symptom_name"] == "Dizziness" for s in prep["recent_symptoms"])
    # Assessment summary populated
    assert prep["latest_assessment"] is not None
    assert prep["latest_assessment"]["risk_category"] == "MODERATE"

