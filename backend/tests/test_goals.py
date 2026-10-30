from datetime import date


def test_requires_auth(client):
    assert client.get("/api/goals").status_code == 401


class TestCreateAndBasicCRUD:
    def test_create_and_get(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/goals", headers=h, json={
            "goal_type": "EXERCISE", "target_value": 150, "unit": "minutes/week",
            "goal_description": "Stay active"})
        assert r.status_code == 201
        goal = r.json()
        assert goal["status"] == "ACTIVE" and goal["is_achieved"] is False
        assert client.get(f"/api/goals/{goal['id']}", headers=h).json()["id"] == goal["id"]

    def test_rejects_non_positive_target(self, client, auth_headers):
        h = auth_headers()
        assert client.post("/api/goals", headers=h, json={"goal_type": "SLEEP", "target_value": 0}).status_code == 422
        assert client.post("/api/goals", headers=h, json={"goal_type": "SLEEP", "target_value": -5}).status_code == 422

    def test_rejects_end_before_start(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/goals", headers=h, json={
            "goal_type": "SLEEP", "target_value": 8, "start_date": "2026-01-10", "end_date": "2026-01-01"})
        assert r.status_code == 422

    def test_ownership_isolation(self, client, auth_headers):
        a = auth_headers("a@test.com")
        b = auth_headers("b@test.com")
        goal = client.post("/api/goals", headers=a, json={"goal_type": "SLEEP", "target_value": 8}).json()
        assert client.get(f"/api/goals/{goal['id']}", headers=b).status_code == 404
        assert client.put(f"/api/goals/{goal['id']}", headers=b, json={"status": "PAUSED"}).status_code == 404
        assert client.delete(f"/api/goals/{goal['id']}", headers=b).status_code == 404
        assert client.get("/api/goals", headers=b).json() == []

    def test_update_status_and_mark_completed(self, client, auth_headers):
        h = auth_headers()
        goal = client.post("/api/goals", headers=h, json={"goal_type": "SLEEP", "target_value": 8}).json()
        r = client.put(f"/api/goals/{goal['id']}", headers=h, json={"status": "COMPLETED"})
        assert r.json()["status"] == "COMPLETED" and r.json()["is_achieved"] is True

    def test_delete(self, client, auth_headers):
        h = auth_headers()
        goal = client.post("/api/goals", headers=h, json={"goal_type": "SLEEP", "target_value": 8}).json()
        assert client.delete(f"/api/goals/{goal['id']}", headers=h).status_code == 204
        assert client.get(f"/api/goals/{goal['id']}", headers=h).status_code == 404

    def test_filter_by_status(self, client, auth_headers):
        h = auth_headers()
        g1 = client.post("/api/goals", headers=h, json={"goal_type": "SLEEP", "target_value": 8}).json()
        client.post("/api/goals", headers=h, json={"goal_type": "HYDRATION", "target_value": 2000})
        client.put(f"/api/goals/{g1['id']}", headers=h, json={"status": "PAUSED"})
        active = client.get("/api/goals?status=ACTIVE", headers=h).json()
        paused = client.get("/api/goals?status=PAUSED", headers=h).json()
        assert len(active) == 1 and len(paused) == 1


class TestExerciseGoalProgress:
    def test_progress_from_real_exercise_logs(self, client, auth_headers):
        h = auth_headers()
        goal = client.post("/api/goals", headers=h, json={
            "goal_type": "EXERCISE", "target_value": 100, "unit": "minutes/week"}).json()
        client.post("/api/exercise", headers=h, json={"exercise_type": "Run", "duration_minutes": 50})
        r = client.get(f"/api/goals/{goal['id']}", headers=h).json()
        assert r["current_value"] == 50.0 and r["percentage_complete"] == 50.0

    def test_no_data_gives_note_not_error(self, client, auth_headers):
        h = auth_headers()
        goal = client.post("/api/goals", headers=h, json={"goal_type": "EXERCISE", "target_value": 100}).json()
        assert goal["current_value"] is None and goal["percentage_complete"] is None
        assert "exercise" in goal["progress_note"].lower()

    def test_caps_at_100_percent(self, client, auth_headers):
        h = auth_headers()
        goal = client.post("/api/goals", headers=h, json={"goal_type": "EXERCISE", "target_value": 50}).json()
        client.post("/api/exercise", headers=h, json={"exercise_type": "Run", "duration_minutes": 200})
        r = client.get(f"/api/goals/{goal['id']}", headers=h).json()
        assert r["percentage_complete"] == 100.0


class TestSleepGoalProgress:
    def test_progress_from_real_sleep_logs(self, client, auth_headers):
        h = auth_headers()
        goal = client.post("/api/goals", headers=h, json={"goal_type": "SLEEP", "target_value": 8}).json()
        client.post("/api/sleep", headers=h, json={"bedtime": "23:00", "wake_time": "07:00"})
        r = client.get(f"/api/goals/{goal['id']}", headers=h).json()
        assert r["current_value"] == 8.0 and r["percentage_complete"] == 100.0


class TestHydrationGoalProgress:
    def test_progress_from_todays_hydration(self, client, auth_headers):
        h = auth_headers()
        goal = client.post("/api/goals", headers=h, json={"goal_type": "HYDRATION", "target_value": 2000}).json()
        client.post("/api/hydration", headers=h, json={"water_intake_ml": 500})
        r = client.get(f"/api/goals/{goal['id']}", headers=h).json()
        assert r["current_value"] == 500.0 and r["percentage_complete"] == 25.0

    def test_zero_logged_is_zero_percent_not_missing_data(self, client, auth_headers):
        h = auth_headers()
        goal = client.post("/api/goals", headers=h, json={"goal_type": "HYDRATION", "target_value": 2000}).json()
        r = client.get(f"/api/goals/{goal['id']}", headers=h).json()
        assert r["current_value"] == 0.0 and r["percentage_complete"] == 0.0
        assert r["progress_note"] is None


class TestWeightGoalProgress:
    def test_progress_from_profile_weight(self, client, auth_headers):
        h = auth_headers()
        client.put("/api/profile", headers=h, json={"weight_kg": 75})
        goal = client.post("/api/goals", headers=h, json={"goal_type": "WEIGHT", "target_value": 70}).json()
        client.put("/api/profile", headers=h, json={"weight_kg": 72})
        r = client.get(f"/api/goals/{goal['id']}", headers=h).json()
        assert r["current_value"] == 72.0
        assert 0 < r["percentage_complete"] < 100
        assert "starting weight" in r["progress_note"].lower()

    def test_progress_from_profile_weight_closeness_fallback(self, client, auth_headers):
        h = auth_headers()
        client.put("/api/profile", headers=h, json={"weight_kg": 75})
        goal = client.post("/api/goals", headers=h, json={"goal_type": "WEIGHT", "target_value": 70, "baseline_value": None}).json()
        r = client.get(f"/api/goals/{goal['id']}", headers=h).json()
        assert r["current_value"] == 75.0
        # If baseline is populated automatically from profile, progress_note indicates starting weight
        assert r["percentage_complete"] is not None
        assert r["progress_note"] is not None

    def test_no_weight_in_profile_gives_note(self, client, auth_headers):
        h = auth_headers()
        goal = client.post("/api/goals", headers=h, json={"goal_type": "WEIGHT", "target_value": 70}).json()
        assert goal["current_value"] is None
        assert "profile" in goal["progress_note"].lower()


class TestMedicineAdherenceGoalProgress:
    def test_progress_from_real_adherence(self, client, auth_headers):
        h = auth_headers()
        goal = client.post("/api/goals", headers=h, json={"goal_type": "MEDICINE_ADHERENCE", "target_value": 100}).json()
        med = client.post("/api/medicines", headers=h, json={
            "medicine_name": "X", "frequency_unit": "DAILY", "time_of_day": ["08:00"],
            "start_date": date.today().isoformat()}).json()
        entry = client.get(f"/api/medicines/{med['id']}/schedule?past_days=0&upcoming_days=0", headers=h).json()[0]
        client.post(f"/api/medicines/{med['id']}/schedule/{entry['id']}/taken", headers=h)
        r = client.get(f"/api/goals/{goal['id']}", headers=h).json()
        assert r["current_value"] == 100.0 and r["percentage_complete"] == 100.0

    def test_no_active_medicine_gives_note(self, client, auth_headers):
        h = auth_headers()
        goal = client.post("/api/goals", headers=h, json={"goal_type": "MEDICINE_ADHERENCE", "target_value": 90}).json()
        assert goal["current_value"] is None
        assert "medicine" in goal["progress_note"].lower()


class TestOtherGoalType:
    def test_other_type_never_computes_progress(self, client, auth_headers):
        h = auth_headers()
        goal = client.post("/api/goals", headers=h, json={
            "goal_type": "OTHER", "target_value": 10, "goal_description": "Custom goal"}).json()
        assert goal["current_value"] is None and goal["percentage_complete"] is None
        assert goal["progress_note"] is not None
