"""Integration and Unit tests for Phase 2: Voice-Assisted Health Entry.

Validates:
- Spoken phrase parsing for Weight, Blood Pressure, Sleep, Hydration, Exercise
- Unit normalization (lbs -> kg, liters -> ml, word numbers)
- Fallback / rejection on ambiguous or empty transcripts
- Confirmation preview workflow before saving
- Authorized save endpoint with profile scoping
"""

from datetime import date
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import ExerciseLog, HealthAssessment, HydrationLog, SleepLog, User, UserProfile
from app.services.voice_parser_service import parse_voice_health_entry


def test_voice_parser_units():
    """Unit test parser for various spoken health entries."""
    # 1. Weight
    p1 = parse_voice_health_entry("My weight is 68 kilograms")
    assert p1["recognized"] is True
    assert p1["metric_type"] == "WEIGHT"
    assert p1["structured_fields"]["weight_kg"] == 68.0

    p1_lbs = parse_voice_health_entry("Weighed 150 pounds this morning")
    assert p1_lbs["recognized"] is True
    assert p1_lbs["metric_type"] == "WEIGHT"
    assert 67.5 <= p1_lbs["structured_fields"]["weight_kg"] <= 68.5

    # 2. Blood Pressure
    p2 = parse_voice_health_entry("My blood pressure is 120 over 80")
    assert p2["recognized"] is True
    assert p2["metric_type"] == "BLOOD_PRESSURE"
    assert p2["structured_fields"]["systolic_bp"] == 120
    assert p2["structured_fields"]["diastolic_bp"] == 80

    # 3. Sleep
    p3 = parse_voice_health_entry("I slept for seven hours last night")
    assert p3["recognized"] is True
    assert p3["metric_type"] == "SLEEP"
    assert p3["structured_fields"]["sleep_duration_hours"] == 7.0

    # 4. Hydration
    p4 = parse_voice_health_entry("Drank two liters of water")
    assert p4["recognized"] is True
    assert p4["metric_type"] == "HYDRATION"
    assert p4["structured_fields"]["water_intake_ml"] == 2000

    # 5. Exercise
    p5 = parse_voice_health_entry("Ran for thirty minutes in the park")
    assert p5["recognized"] is True
    assert p5["metric_type"] == "EXERCISE"
    assert p5["structured_fields"]["duration_minutes"] == 30
    assert p5["structured_fields"]["exercise_type"] == "Running"

    # 6. Ambiguous / Empty
    p6 = parse_voice_health_entry("Hello there how are you")
    assert p6["recognized"] is False


def test_voice_api_parse_and_confirm_save(client: TestClient, db: Session, make_user, clean_state):
    """Test POST /api/health/voice/parse and confirmed save /confirm-save."""
    user = make_user(email="voice_user@example.com", name="Voice User")
    login_res = client.post("/api/auth/login", json={"email": "voice_user@example.com", "password": "Str0ng!Passw0rd"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Parse endpoint with auth header
    parse_res = client.post("/api/health/voice/parse", json={"transcript": "Blood pressure 130 over 85"}, headers=headers)
    assert parse_res.status_code == 200
    p_data = parse_res.json()
    assert p_data["recognized"] is True
    assert p_data["metric_type"] == "BLOOD_PRESSURE"
    assert p_data["structured_fields"]["systolic_bp"] == 130
    assert p_data["structured_fields"]["diastolic_bp"] == 85

    # 2. Confirm-save endpoint
    save_res = client.post(
        "/api/health/voice/confirm-save",
        json={
            "metric_type": "BLOOD_PRESSURE",
            "fields": p_data["structured_fields"],
            "target_date": str(date.today()),
        },
        headers=headers,
    )
    assert save_res.status_code == 200
    assert save_res.json()["status"] == "saved"

    # Verify saved in HealthAssessment
    ha = db.query(HealthAssessment).filter(HealthAssessment.user_id == user.id).first()
    assert ha is not None
    assert ha.systolic_bp == 130
    assert ha.diastolic_bp == 85

    # 3. Test Hydration Save
    save_hy = client.post(
        "/api/health/voice/confirm-save",
        json={
            "metric_type": "HYDRATION",
            "fields": {"water_intake_ml": 800},
            "target_date": str(date.today()),
        },
        headers=headers,
    )
    assert save_hy.status_code == 200
    db.commit()
    hy = db.query(HydrationLog).filter(HydrationLog.user_id == user.id).first()
    assert hy is not None
    assert hy.water_intake_ml == 800
