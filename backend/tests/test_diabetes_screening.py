"""Tests for Diabetes Risk Assessment (FINDRISC / ADA non-invasive screening)."""

import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.care_profile import CareProfile, CaregiverAccess, CaregiverAccessLevel, CaregiverInviteStatus
from app.services.diabetes_service import calculate_findrisc_score


def test_findrisc_scoring_low_risk():
    """Verify lowest risk scoring (young, normal weight, active, good diet)."""
    result = calculate_findrisc_score(
        age=32,
        bmi=21.5,
        gender="MALE",
        waist_circumference_cm=82.0,
        physical_activity_daily_30m=True,
        daily_fruits_vegetables=True,
        hypertension_meds=False,
        history_high_blood_glucose=False,
        family_history_diabetes="NONE",
    )
    assert result["total_score"] == 0
    assert result["risk_level"] == "LOW"
    assert "approx. 1%" in result["risk_probability_text"]
    assert "FINDRISC" in result["clinical_guidance"]


def test_findrisc_scoring_high_risk():
    """Verify high risk calculation with elevated parameters."""
    result = calculate_findrisc_score(
        age=66,                           # +4
        bmi=32.0,                         # +3
        gender="MALE",
        waist_circumference_cm=106.0,     # +4
        physical_activity_daily_30m=False,# +2
        daily_fruits_vegetables=False,    # +1
        hypertension_meds=True,           # +2
        history_high_blood_glucose=True,  # +5
        family_history_diabetes="FIRST_DEGREE", # +5
        fasting_glucose_mg_dl=135.0,
        hba1c_percent=7.1,
    )
    # Total = 4 + 3 + 4 + 2 + 1 + 2 + 5 + 5 = 26
    assert result["total_score"] == 26
    assert result["risk_level"] == "VERY_HIGH"
    assert "approx. 50%" in result["risk_probability_text"]
    assert len(result["lab_notes"]) == 2


def test_api_diabetes_calculate(client: TestClient):
    """Test preview calculation endpoint without DB write."""
    payload = {
        "age": 50,
        "gender": "FEMALE",
        "bmi": 26.5,
        "waist_circumference_cm": 84.0,
        "physical_activity_daily_30m": True,
        "daily_fruits_vegetables": True,
        "hypertension_meds": False,
        "history_high_blood_glucose": False,
        "family_history_diabetes": "SECOND_DEGREE",
    }
    resp = client.post("/api/health/diabetes/calculate", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "total_score" in data
    assert data["risk_level"] in ("LOW", "SLIGHTLY_ELEVATED", "MODERATE", "HIGH", "VERY_HIGH")


def test_api_diabetes_screen_and_history(client: TestClient, db: Session, auth_headers, clean_state):
    """Test screen submission, persistence, and history retrieval."""
    headers = auth_headers(email="diabetes_user@example.com")
    payload = {
        "age": 46,
        "gender": "MALE",
        "bmi": 28.0,
        "waist_circumference_cm": 96.0,
        "physical_activity_daily_30m": False,
        "daily_fruits_vegetables": False,
        "hypertension_meds": True,
        "history_high_blood_glucose": False,
        "family_history_diabetes": "NONE",
    }
    # 1. Submit screening
    resp = client.post("/api/health/diabetes/screen", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["id"] is not None
    assert data["total_score"] > 0
    assert data["method"] == "ADA_FINDRISC_V1"

    # 2. Get history
    hist_resp = client.get("/api/health/diabetes/history", headers=headers)
    assert hist_resp.status_code == 200
    history = hist_resp.json()
    assert len(history) >= 1
    assert history[0]["id"] == data["id"]


def test_api_diabetes_validation_rejections(client: TestClient, auth_headers):
    """Test validation prevents unreasonable boundaries and missing inputs."""
    headers = auth_headers(email="validation_user@example.com")
    
    # Missing required fields
    resp = client.post("/api/health/diabetes/screen", json={"age": 45}, headers=headers)
    assert resp.status_code == 422

    # Unrealistic age / BMI
    resp = client.post("/api/health/diabetes/screen", json={
        "age": 200,  # Invalid age > 120
        "gender": "MALE",
        "bmi": 150.0, # Invalid BMI > 80
        "waist_circumference_cm": 90.0,
        "physical_activity_daily_30m": True,
        "daily_fruits_vegetables": True,
        "hypertension_meds": False,
        "history_high_blood_glucose": False,
        "family_history_diabetes": "NONE",
    }, headers=headers)
    assert resp.status_code == 422
