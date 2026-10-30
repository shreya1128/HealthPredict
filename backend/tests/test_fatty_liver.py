"""Tests for Phase 6: Fatty Liver (MASLD/NAFLD) Risk Awareness."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.fatty_liver_service import evaluate_fatty_liver_risk


def test_fatty_liver_low_risk_evaluation():
    """Verify low awareness status for healthy cardiometabolic parameters."""
    res = evaluate_fatty_liver_risk(
        bmi=22.0,
        waist_circumference_cm=78.0,
        has_hypertension=False,
        has_type2_diabetes_or_prediabetes=False,
        high_triglycerides=False,
        low_hdl=False,
        alcohol_units_weekly=2,
    )
    assert res["risk_level"] == "LOW_AWARENESS"
    assert res["metabolic_factors_count"] == 0
    assert "Educational Awareness Notice" in res["clinical_guidance"]


def test_fatty_liver_high_risk_and_enzymes():
    """Verify high awareness for multiple metabolic factors and elevated ALT."""
    res = evaluate_fatty_liver_risk(
        bmi=31.5,
        waist_circumference_cm=102.0,
        has_hypertension=True,
        has_type2_diabetes_or_prediabetes=True,
        high_triglycerides=True,
        low_hdl=True,
        alcohol_units_weekly=18,
        alt_u_l=58.0,
        ast_u_l=42.0,
    )
    assert res["risk_level"] == "HIGH_AWARENESS"
    assert res["metabolic_factors_count"] >= 4
    assert res["elevated_enzymes"] is True
    assert res["alcohol_excess"] is True
    assert "above typical reference limits" in res["clinical_guidance"]


def test_api_fatty_liver_calculate_and_screen(client: TestClient, auth_headers, clean_state):
    """Test preview calculation and authenticated screening submission."""
    headers = auth_headers(email="liver_user@example.com")

    # 1. Preview
    payload = {
        "bmi": 27.5,
        "waist_circumference_cm": 92.0,
        "has_hypertension": True,
        "has_type2_diabetes_or_prediabetes": False,
        "high_triglycerides": True,
        "low_hdl": False,
        "alcohol_units_weekly": 4,
    }
    calc_resp = client.post("/api/health/fatty-liver/evaluate", json=payload, headers=headers)
    assert calc_resp.status_code == 200
    assert calc_resp.json()["risk_level"] in ("LOW_AWARENESS", "MODERATE_AWARENESS", "HIGH_AWARENESS")

    # 2. Submit
    screen_resp = client.post("/api/health/fatty-liver/screen", json=payload, headers=headers)
    assert screen_resp.status_code == 201
    data = screen_resp.json()
    assert data["id"] is not None
    assert data["metabolic_factors_count"] >= 2

    # 3. History
    hist_resp = client.get("/api/health/fatty-liver/history", headers=headers)
    assert hist_resp.status_code == 200
    assert len(hist_resp.json()) >= 1
