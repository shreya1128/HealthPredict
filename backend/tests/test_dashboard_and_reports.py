from datetime import date, timedelta

from pypdf import PdfReader
import io


def test_dashboard_requires_auth(client):
    assert client.get("/api/dashboard").status_code == 401


def test_dashboard_works_for_a_brand_new_user_with_no_data(client, auth_headers):
    """Every sub-section must degrade gracefully, not 500, for a user with nothing logged yet."""
    h = auth_headers()
    r = client.get("/api/dashboard", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["latest_assessment"] is None
    assert body["today_medicines"] == []
    assert body["hydration_today"]["total_ml"] == 0
    assert body["exercise_this_week"]["total_minutes"] == 0
    assert body["active_goals"] == []
    assert body["insights"] == []


def test_dashboard_reflects_real_data_across_subsystems(client, auth_headers):
    h = auth_headers()
    client.post("/api/exercise", headers=h, json={"exercise_type": "Run", "duration_minutes": 30})
    client.post("/api/hydration", headers=h, json={"water_intake_ml": 500})
    client.post("/api/medicines", headers=h, json={
        "medicine_name": "X", "frequency_unit": "DAILY", "time_of_day": ["08:00"],
        "start_date": date.today().isoformat()})
    client.post("/api/goals", headers=h, json={"goal_type": "EXERCISE", "target_value": 100})

    body = client.get("/api/dashboard", headers=h).json()
    assert body["exercise_this_week"]["total_minutes"] == 30
    assert body["hydration_today"]["total_ml"] == 500
    assert len(body["today_medicines"]) == 1
    assert len(body["active_goals"]) == 1
    assert body["active_goals"][0]["current_value"] == 30.0


def test_dashboard_only_shows_own_data(client, auth_headers):
    a = auth_headers("a@test.com")
    b = auth_headers("b@test.com")
    client.post("/api/exercise", headers=a, json={"exercise_type": "Run", "duration_minutes": 30})
    body = client.get("/api/dashboard", headers=b).json()
    assert body["exercise_this_week"]["total_minutes"] == 0


class TestWeeklyReport:
    def test_requires_auth(self, client):
        assert client.get("/api/reports/weekly").status_code == 401

    def test_empty_report_has_no_data_everywhere(self, client, auth_headers):
        h = auth_headers()
        r = client.get("/api/reports/weekly", headers=h)
        assert r.status_code == 200
        body = r.json()
        assert body["average_health_score"] is None
        assert body["significant_changes"] == [] and body["recommendations"] != []  # nudges for missing data

    def test_report_reflects_real_logged_data(self, client, auth_headers):
        h = auth_headers()
        client.post("/api/exercise", headers=h, json={"exercise_type": "Run", "duration_minutes": 60})
        client.post("/api/sleep", headers=h, json={"bedtime": "23:00", "wake_time": "07:00"})
        client.post("/api/hydration", headers=h, json={"water_intake_ml": 2000})
        body = client.get("/api/reports/weekly", headers=h).json()
        assert body["total_exercise_minutes"] == 60
        assert body["average_sleep_duration"] == 8.0
        assert body["average_hydration_ml"] == 2000.0

    def test_week_start_normalized_to_monday(self, client, auth_headers):
        h = auth_headers()
        wednesday = date.today() - timedelta(days=(date.today().weekday() - 2) % 7 or 7)
        body = client.get(f"/api/reports/weekly?week_start={wednesday.isoformat()}", headers=h).json()
        expected_monday = wednesday - timedelta(days=wednesday.weekday())
        assert body["week_start_date"] == expected_monday.isoformat()

    def test_viewing_a_report_persists_it_to_history(self, client, auth_headers):
        h = auth_headers()
        assert client.get("/api/reports/weekly/history", headers=h).json() == []
        client.get("/api/reports/weekly", headers=h)
        history = client.get("/api/reports/weekly/history", headers=h).json()
        assert len(history) == 1

    def test_viewing_the_same_week_twice_does_not_duplicate_history(self, client, auth_headers):
        h = auth_headers()
        client.get("/api/reports/weekly", headers=h)
        client.post("/api/exercise", headers=h, json={"exercise_type": "Run", "duration_minutes": 20})
        client.get("/api/reports/weekly", headers=h)  # same week, updated data
        history = client.get("/api/reports/weekly/history", headers=h).json()
        assert len(history) == 1

    def test_history_only_shows_own_reports(self, client, auth_headers):
        a = auth_headers("a@test.com")
        b = auth_headers("b@test.com")
        client.get("/api/reports/weekly", headers=a)
        assert client.get("/api/reports/weekly/history", headers=b).json() == []

    def test_pdf_download(self, client, auth_headers):
        h = auth_headers()
        client.post("/api/exercise", headers=h, json={"exercise_type": "Run", "duration_minutes": 45})
        client.get("/api/reports/weekly", headers=h)  # ensure it's persisted
        report_id = client.get("/api/reports/weekly/history", headers=h).json()[0]["id"]

        r = client.get(f"/api/reports/weekly/{report_id}/pdf", headers=h)
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert "attachment" in r.headers["content-disposition"]

        text = PdfReader(io.BytesIO(r.content)).pages[0].extract_text()
        assert "45" in text  # the exercise minutes we logged
        assert "not a medical diagnosis" in text

    def test_pdf_ownership_isolation(self, client, auth_headers):
        a = auth_headers("a@test.com")
        b = auth_headers("b@test.com")
        client.get("/api/reports/weekly", headers=a)
        report_id = client.get("/api/reports/weekly/history", headers=a).json()[0]["id"]
        assert client.get(f"/api/reports/weekly/{report_id}/pdf", headers=b).status_code == 404

    def test_pdf_nonexistent_report_404s(self, client, auth_headers):
        h = auth_headers()
        assert client.get("/api/reports/weekly/999999/pdf", headers=h).status_code == 404

    def test_weight_change_computed_from_assessments_across_the_week(self, client, auth_headers):
        h = auth_headers()
        client.put("/api/profile", headers=h, json={"weight_kg": 80})
        client.post("/api/health/assessment", headers=h, json={"heart_rate_bpm": 70})
        client.put("/api/profile", headers=h, json={"weight_kg": 78})
        client.post("/api/health/assessment", headers=h, json={"heart_rate_bpm": 72})
        body = client.get("/api/reports/weekly", headers=h).json()
        # Same-day upsert (Phase 3 behaviour): both assessments land in the SAME day's history
        # row, so only the latest weight (78) is ever recorded - weight_change is 0 within one day.
        assert body["weight_change_kg"] == 0.0
