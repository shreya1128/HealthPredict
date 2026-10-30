"""Tests for Phase 5: Menstrual Cycle Tracking & PCOS Educational Support."""

from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.menstrual import MenstrualLog, PCOSScreening
from app.services.menstrual_service import evaluate_pcos_symptoms


def test_pcos_evaluation_scoring():
    """Verify Rotterdam-aligned educational evaluation logic."""
    # 2 features -> elevated likelihood
    res = evaluate_pcos_symptoms(
        cycle_regularity="IRREGULAR",
        excess_androgen_symptoms=["HIRSUTISM", "ACNE"],
        metabolic_indicators=["WEIGHT_GAIN"],
        ultrasound_findings="NOT_DONE",
    )
    assert res["rotterdam_features_count"] >= 2
    assert "Meets Rotterdam Educational Screening Patterns" in res["risk_assessment_text"]
    assert "Educational Notice" in res["educational_guidance"]

    # Low likelihood
    res_low = evaluate_pcos_symptoms(
        cycle_regularity="REGULAR",
        excess_androgen_symptoms=[],
        metabolic_indicators=[],
    )
    assert res_low["rotterdam_features_count"] == 0
    assert "Low Likelihood" in res_low["risk_assessment_text"]


def test_menstrual_logs_and_cycle_analytics(client: TestClient, db: Session, auth_headers, clean_state):
    """Test full cycle: log two periods, verify cycle length calculation, get analytics, and delete."""
    headers = auth_headers(email="cycle_user@example.com")

    # 1. First period: 28 days ago, lasted 5 days
    day_start_1 = date.today() - timedelta(days=28)
    day_end_1 = day_start_1 + timedelta(days=4)
    payload_1 = {
        "period_start_date": day_start_1.isoformat(),
        "period_end_date": day_end_1.isoformat(),
        "flow_intensity": "MEDIUM",
        "pain_level": 3,
        "symptoms": ["CRAMPS"],
        "notes": "Normal cycle start",
    }
    resp1 = client.post("/api/health/menstrual/logs", json=payload_1, headers=headers)
    assert resp1.status_code == 201, resp1.text
    data1 = resp1.json()
    assert data1["period_duration_days"] == 5
    assert data1["cycle_length_days"] is None  # First cycle has no prior cycle to measure against

    # 2. Second period: today, lasted 4 days
    day_start_2 = date.today()
    day_end_2 = day_start_2 + timedelta(days=3)
    payload_2 = {
        "period_start_date": day_start_2.isoformat(),
        "period_end_date": day_end_2.isoformat(),
        "flow_intensity": "HEAVY",
        "pain_level": 5,
        "symptoms": ["HEADACHE", "BLOATING"],
    }
    resp2 = client.post("/api/health/menstrual/logs", json=payload_2, headers=headers)
    assert resp2.status_code == 201, resp2.text
    data2 = resp2.json()
    assert data2["period_duration_days"] == 4
    assert data2["cycle_length_days"] == 28  # Exactly 28 days between starts

    # 3. Check analytics
    analytics_resp = client.get("/api/health/menstrual/analytics", headers=headers)
    assert analytics_resp.status_code == 200
    analytics = analytics_resp.json()
    assert analytics["total_cycles_recorded"] == 2
    assert analytics["average_cycle_length_days"] == 28.0
    assert analytics["cycle_regularity"] == "REGULAR"

    # 4. User-controlled deletion (privacy control)
    del_resp = client.delete(f"/api/health/menstrual/logs/{data1['id']}", headers=headers)
    assert del_resp.status_code == 204


def test_menstrual_validation_boundaries(client: TestClient, auth_headers):
    """Verify rejection of invalid dates and durations."""
    headers = auth_headers(email="boundary_user@example.com")

    # End date before start date
    resp_invalid = client.post("/api/health/menstrual/logs", json={
        "period_start_date": date.today().isoformat(),
        "period_end_date": (date.today() - timedelta(days=2)).isoformat(),
    }, headers=headers)
    assert resp_invalid.status_code == 422

    # Period duration > 21 days
    resp_too_long = client.post("/api/health/menstrual/logs", json={
        "period_start_date": (date.today() - timedelta(days=25)).isoformat(),
        "period_end_date": date.today().isoformat(),
    }, headers=headers)
    assert resp_too_long.status_code == 422


def test_pcos_api_screening(client: TestClient, auth_headers, clean_state):
    """Test educational PCOS screening endpoint."""
    headers = auth_headers(email="pcos_user@example.com")

    payload = {
        "cycle_regularity": "IRREGULAR",
        "excess_androgen_symptoms": ["ACNE"],
        "metabolic_indicators": ["WEIGHT_GAIN"],
        "ultrasound_findings": "NOT_DONE",
    }
    resp = client.post("/api/health/menstrual/pcos/screen", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert "educational_guidance" in data
    assert "Rotterdam" in data["educational_guidance"] or "Educational Notice" in data["educational_guidance"]
