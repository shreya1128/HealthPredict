from datetime import date, timedelta
from decimal import Decimal

from app.models import HealthHistory


def complete_profile(client, headers, **overrides):
    payload = {
        "height_cm": 170, "weight_kg": 70, "exercise_frequency": "ACTIVE",
        "sleep_duration_hours": 8, "smoking_status": "NEVER", "alcohol_consumption": "NEVER",
    }
    payload.update(overrides)
    r = client.put("/api/profile", headers=headers, json=payload)
    assert r.status_code == 200
    return r.json()


VITALS = {"systolic_bp": 118, "diastolic_bp": 76, "heart_rate_bpm": 68, "blood_glucose_mg_dl": 88,
         "spo2_percent": 98, "temperature_celsius": 36.7}


def test_requires_auth(client):
    assert client.post("/api/health/assessment", json=VITALS).status_code == 401
    assert client.get("/api/health/assessment/history").status_code == 401
    assert client.get("/api/health/history").status_code == 401


def test_create_assessment_with_complete_profile(client, auth_headers):
    h = auth_headers()
    complete_profile(client, h)
    r = client.post("/api/health/assessment", headers=h, json=VITALS)
    assert r.status_code == 201
    body = r.json()
    assert body["risk_category"] == "LOW"
    assert float(body["health_score"]) >= 90
    assert float(body["data_completeness_percent"]) == 100.0
    assert body["status"] == "COMPLETED"
    assert body["assessment_date"] == date.today().isoformat()
    assert "not a medical diagnosis" in body["disclaimer"]
    assert body["glucose_caveat"] is not None                # glucose was submitted
    assert body["profile_hints"] == []                        # profile was complete
    keys = {c["key"] for c in body["score_breakdown"]["components"]}
    assert keys == {"cardiovascular", "metabolic", "vitals", "activity", "sleep", "substance_use"}
    assert body["score_breakdown"]["skipped"] == []
    assert round(sum(c["weight_pct"] for c in body["score_breakdown"]["components"]), 1) == 100.0


def test_create_assessment_without_glucose_has_no_caveat(client, auth_headers):
    h = auth_headers()
    complete_profile(client, h)
    vitals = {k: v for k, v in VITALS.items() if k != "blood_glucose_mg_dl"}
    body = client.post("/api/health/assessment", headers=h, json=vitals).json()
    assert body["glucose_caveat"] is None


def test_create_assessment_with_incomplete_profile_gives_hints_and_partial_completeness(client, auth_headers):
    h = auth_headers()  # no profile fields set at all
    r = client.post("/api/health/assessment", headers=h, json=VITALS)
    assert r.status_code == 201
    body = r.json()
    assert float(body["data_completeness_percent"]) < 100.0
    assert len(body["profile_hints"]) > 0
    skipped_keys = {c["key"] for c in body["score_breakdown"]["skipped"]}
    assert "metabolic" not in skipped_keys                     # glucose alone still covers it
    assert {"activity", "sleep", "substance_use"} <= skipped_keys


def test_create_assessment_rejects_empty_body(client, auth_headers):
    r = client.post("/api/health/assessment", headers=auth_headers(), json={})
    assert r.status_code == 422


def test_create_assessment_rejects_one_sided_blood_pressure(client, auth_headers):
    h = auth_headers()
    r = client.post("/api/health/assessment", headers=h, json={"systolic_bp": 120})
    assert r.status_code == 422
    r2 = client.post("/api/health/assessment", headers=h, json={"diastolic_bp": 80})
    assert r2.status_code == 422


def test_create_assessment_rejects_out_of_range_vitals(client, auth_headers):
    h = auth_headers()
    for bad in ({"heart_rate_bpm": 5}, {"heart_rate_bpm": 400}, {"spo2_percent": 10},
               {"temperature_celsius": 60}, {"blood_glucose_mg_dl": 5000}):
        assert client.post("/api/health/assessment", headers=h, json=bad).status_code == 422, bad


def test_single_vital_is_accepted(client, auth_headers):
    r = client.post("/api/health/assessment", headers=auth_headers(), json={"heart_rate_bpm": 70})
    assert r.status_code == 201
    assert r.json()["health_score"] is not None


def test_get_assessment_by_id_and_ownership_isolation(client, auth_headers):
    a = auth_headers("a@test.com")
    created = client.post("/api/health/assessment", headers=a, json=VITALS).json()
    fetched = client.get(f"/api/health/assessment/{created['id']}", headers=a)
    assert fetched.status_code == 200 and fetched.json()["id"] == created["id"]

    b = auth_headers("b@test.com")
    other = client.get(f"/api/health/assessment/{created['id']}", headers=b)
    assert other.status_code == 404                            # not 403 - existence not revealed


def test_get_nonexistent_assessment_404(client, auth_headers):
    assert client.get("/api/health/assessment/999999", headers=auth_headers()).status_code == 404


def test_latest_assessment(client, auth_headers):
    h = auth_headers()
    assert client.get("/api/health/assessment/latest", headers=h).status_code == 404
    client.post("/api/health/assessment", headers=h, json={"heart_rate_bpm": 65})
    second = client.post("/api/health/assessment", headers=h, json={"heart_rate_bpm": 200})  # worse score
    latest = client.get("/api/health/assessment/latest", headers=h)
    assert latest.status_code == 200 and latest.json()["id"] == second.json()["id"]


def test_list_assessments_paginates_newest_first(client, auth_headers):
    h = auth_headers()
    ids = [client.post("/api/health/assessment", headers=h, json={"heart_rate_bpm": 60 + i}).json()["id"]
          for i in range(5)]
    page = client.get("/api/health/assessment/history?page_size=2", headers=h).json()
    assert page["total"] == 5 and len(page["items"]) == 2
    assert [item["id"] for item in page["items"]] == list(reversed(ids))[:2]


def test_list_assessments_only_shows_own(client, auth_headers):
    a = auth_headers("a@test.com")
    b = auth_headers("b@test.com")
    client.post("/api/health/assessment", headers=a, json={"heart_rate_bpm": 70})
    assert client.get("/api/health/assessment/history", headers=b).json()["total"] == 0


def test_history_upserts_same_day_and_reflects_profile_snapshot(client, auth_headers, db):
    h = auth_headers()
    complete_profile(client, h, weight_kg=70)
    client.post("/api/health/assessment", headers=h, json={"heart_rate_bpm": 70})
    complete_profile(client, h, weight_kg=68)  # weight changes between the two assessments
    client.post("/api/health/assessment", headers=h, json={"heart_rate_bpm": 75})

    rows = db.query(HealthHistory).all()
    assert len(rows) == 1                                        # same day -> upsert, not insert
    assert float(rows[0].weight_kg) == 68                        # reflects the snapshot at 2nd assessment
    assert rows[0].heart_rate_bpm == 75

    trend = client.get("/api/health/history", headers=h).json()
    assert trend["days"] == 30 and len(trend["points"]) == 1
    assert trend["points"][0]["heart_rate_bpm"] == 75


def test_history_days_filter_excludes_old_rows(client, auth_headers, db):
    h = auth_headers()
    client.post("/api/health/assessment", headers=h, json={"heart_rate_bpm": 70})
    old = HealthHistory(user_id=db.query(HealthHistory).first().user_id,
                        tracking_date=date.today() - timedelta(days=100),
                        health_score=Decimal("50.00"), risk_category="HIGH")
    db.add(old)
    db.commit()

    all_time = client.get("/api/health/history?days=365", headers=h).json()
    recent = client.get("/api/health/history?days=7", headers=h).json()
    assert len(all_time["points"]) == 2
    assert len(recent["points"]) == 1


def test_history_days_param_bounds(client, auth_headers):
    h = auth_headers()
    assert client.get("/api/health/history?days=0", headers=h).status_code == 422
    assert client.get("/api/health/history?days=1000", headers=h).status_code == 422


def complete_profile_for_ml(client, headers):
    """Everything build_features() needs: profile fields + account fields (date_of_birth, gender)."""
    complete_profile(client, headers, cholesterol_level="NORMAL")
    r = client.put("/api/profile", headers=headers, json={
        "date_of_birth": "1985-06-15", "gender": "FEMALE"})
    assert r.status_code == 200
    return r.json()


class TestMLPrediction:
    """Integration tests for the Phase 5 ML prediction, through the real API + real model."""

    def test_prediction_absent_with_reasons_when_profile_incomplete(self, client, auth_headers):
        h = auth_headers()  # no profile, no date_of_birth, gender defaults to OTHER
        body = client.post("/api/health/assessment", headers=h, json=VITALS).json()
        assert body["ml_prediction"] is None
        assert len(body["ml_prediction_missing_fields"]) > 0
        assert any("date of birth" in m for m in body["ml_prediction_missing_fields"])
        assert any("cholesterol" in m for m in body["ml_prediction_missing_fields"])
        assert any("height and weight" in m for m in body["ml_prediction_missing_fields"])

    def test_prediction_works_for_gender_other_via_ensemble(self, client, auth_headers):
        h = auth_headers()
        complete_profile(client, h, cholesterol_level="NORMAL")
        client.put("/api/profile", headers=h, json={"date_of_birth": "1985-06-15", "gender": "OTHER"})
        body = client.post("/api/health/assessment", headers=h, json=VITALS).json()
        pred = body["ml_prediction"]
        if pred is None:
            pytest.skip("No trained model present in this environment")
        assert body["ml_prediction_missing_fields"] == []
        assert 0.0 <= pred["probability"] <= 1.0

    def test_prediction_present_when_everything_is_complete(self, client, auth_headers):
        h = auth_headers()
        complete_profile_for_ml(client, h)
        body = client.post("/api/health/assessment", headers=h, json=VITALS).json()
        pred = body["ml_prediction"]
        if pred is None:
            pytest.skip("No trained model present in this environment - see ml/training/train.py")
        assert body["ml_prediction_missing_fields"] == []
        assert 0.0 <= pred["probability"] <= 1.0
        assert pred["risk_level"] in {"LOW", "MODERATE", "HIGH"}
        assert len(pred["top_factors"]) == 5
        assert all(f["direction"] in {"increases", "decreases"} for f in pred["top_factors"])
        assert "not a medical diagnosis" in pred["disclaimer"]
        assert "model_version" in pred and pred["model_version"]

    def test_prediction_is_independent_from_rule_based_score(self, client, auth_headers):
        """The two systems can legitimately disagree - both must be present and distinct."""
        h = auth_headers()
        complete_profile_for_ml(client, h)
        body = client.post("/api/health/assessment", headers=h, json=VITALS).json()
        if body["ml_prediction"] is None:
            pytest.skip("No trained model present")
        assert body["risk_category"] in {"LOW", "MODERATE", "HIGH"}        # rule-based (Phase 3)
        assert body["ml_prediction"]["risk_level"] in {"LOW", "MODERATE", "HIGH"}  # ML (Phase 5)
        assert "health_score" in body and "probability" in body["ml_prediction"]

    def test_prediction_persists_and_is_returned_on_subsequent_get(self, client, auth_headers):
        h = auth_headers()
        complete_profile_for_ml(client, h)
        created = client.post("/api/health/assessment", headers=h, json=VITALS).json()
        if created["ml_prediction"] is None:
            pytest.skip("No trained model present")
        fetched = client.get(f"/api/health/assessment/{created['id']}", headers=h).json()
        assert fetched["ml_prediction"]["probability"] == created["ml_prediction"]["probability"]
        assert fetched["ml_prediction"]["top_factors"] == created["ml_prediction"]["top_factors"]

    def test_prediction_not_recomputed_if_profile_changes_after_assessment(self, client, auth_headers):
        """Documented design: predictions are a point-in-time snapshot, not live-recomputed."""
        h = auth_headers()
        complete_profile_for_ml(client, h)
        created = client.post("/api/health/assessment", headers=h, json=VITALS).json()
        if created["ml_prediction"] is None:
            pytest.skip("No trained model present")
        original_probability = created["ml_prediction"]["probability"]
        complete_profile(client, h, cholesterol_level="WELL_ABOVE_NORMAL")  # big change
        fetched = client.get(f"/api/health/assessment/{created['id']}", headers=h).json()
        assert fetched["ml_prediction"]["probability"] == original_probability

    def test_missing_fields_shrink_as_profile_is_completed(self, client, auth_headers):
        h = auth_headers()
        before = client.post("/api/health/assessment", headers=h, json=VITALS).json()
        complete_profile_for_ml(client, h)
        after = client.post("/api/health/assessment", headers=h, json=VITALS).json()
        assert len(after["ml_prediction_missing_fields"]) < len(before["ml_prediction_missing_fields"])
