from datetime import date, timedelta


def test_all_endpoints_require_auth(client):
    assert client.get("/api/exercise").status_code == 401
    assert client.get("/api/sleep").status_code == 401
    assert client.get("/api/hydration").status_code == 401
    assert client.get("/api/nutrition").status_code == 401
    assert client.get("/api/goals").status_code == 401


class TestExercise:
    def test_create_and_list(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/exercise", headers=h, json={
            "exercise_type": "Running", "duration_minutes": 30, "intensity": "HIGH", "calories_burned": 300})
        assert r.status_code == 201
        assert r.json()["exercise_type"] == "Running"
        assert len(client.get("/api/exercise", headers=h).json()) == 1

    def test_defaults_to_today_and_moderate_intensity(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/exercise", headers=h, json={"exercise_type": "Walking"})
        assert r.json()["exercise_date"] == date.today().isoformat()
        assert r.json()["intensity"] == "MODERATE"

    def test_rejects_out_of_range_duration(self, client, auth_headers):
        h = auth_headers()
        assert client.post("/api/exercise", headers=h, json={"exercise_type": "X", "duration_minutes": 0}).status_code == 422
        assert client.post("/api/exercise", headers=h, json={"exercise_type": "X", "duration_minutes": 2000}).status_code == 422

    def test_weekly_summary_aggregates_by_day(self, client, auth_headers):
        h = auth_headers()
        client.post("/api/exercise", headers=h, json={"exercise_type": "A", "duration_minutes": 20})
        client.post("/api/exercise", headers=h, json={"exercise_type": "B", "duration_minutes": 15})
        summary = client.get("/api/exercise/weekly", headers=h).json()
        assert summary["total_minutes"] == 35
        assert summary["by_day"][date.today().isoformat()] == 35

    def test_delete_and_ownership(self, client, auth_headers):
        a = auth_headers("a@test.com")
        b = auth_headers("b@test.com")
        entry = client.post("/api/exercise", headers=a, json={"exercise_type": "X", "duration_minutes": 10}).json()
        assert client.delete(f"/api/exercise/{entry['id']}", headers=b).status_code == 404
        assert client.delete(f"/api/exercise/{entry['id']}", headers=a).status_code == 204
        assert client.get("/api/exercise", headers=a).json() == []

    def test_days_filter_excludes_old_entries(self, client, auth_headers, db):
        from app.models import ExerciseLog
        h = auth_headers()
        client.post("/api/exercise", headers=h, json={"exercise_type": "Recent", "duration_minutes": 10})
        old = ExerciseLog(user_id=db.query(ExerciseLog).first().user_id, exercise_date=date.today() - timedelta(days=60),
                          exercise_type="Old", duration_minutes=5)
        db.add(old); db.commit()
        assert len(client.get("/api/exercise?days=7", headers=h).json()) == 1
        assert len(client.get("/api/exercise?days=90", headers=h).json()) == 2


class TestSleep:
    def test_create_computes_duration_from_bed_and_wake_time(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/sleep", headers=h, json={"bedtime": "23:00", "wake_time": "07:00", "sleep_quality": 8})
        assert r.status_code == 201
        assert float(r.json()["sleep_duration_hours"]) == 8.0

    def test_create_without_times_leaves_duration_null(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/sleep", headers=h, json={"sleep_quality": 5})
        assert r.json()["sleep_duration_hours"] is None

    def test_rejects_one_sided_bedtime_wake_time(self, client, auth_headers):
        h = auth_headers()
        assert client.post("/api/sleep", headers=h, json={"bedtime": "23:00"}).status_code == 422
        assert client.post("/api/sleep", headers=h, json={"wake_time": "07:00"}).status_code == 422

    def test_rejects_quality_out_of_range(self, client, auth_headers):
        h = auth_headers()
        assert client.post("/api/sleep", headers=h, json={"sleep_quality": 0}).status_code == 422
        assert client.post("/api/sleep", headers=h, json={"sleep_quality": 11}).status_code == 422

    def test_weekly_summary_averages(self, client, auth_headers):
        h = auth_headers()
        client.post("/api/sleep", headers=h, json={"bedtime": "23:00", "wake_time": "07:00", "sleep_quality": 6})
        summary = client.get("/api/sleep/weekly", headers=h).json()
        assert summary["average_duration_hours"] == 8.0
        assert summary["average_quality"] == 6.0


class TestHydration:
    def test_quick_add_and_daily_total(self, client, auth_headers):
        h = auth_headers()
        client.post("/api/hydration", headers=h, json={"water_intake_ml": 250})
        client.post("/api/hydration", headers=h, json={"water_intake_ml": 250})
        daily = client.get("/api/hydration/daily", headers=h).json()
        assert daily["total_ml"] == 500

    def test_daily_summary_against_profile_goal(self, client, auth_headers):
        h = auth_headers()
        client.put("/api/profile", headers=h, json={"water_intake_goal_ml": 2000})
        client.post("/api/hydration", headers=h, json={"water_intake_ml": 1000})
        daily = client.get("/api/hydration/daily", headers=h).json()
        assert daily["goal_ml"] == 2000 and daily["percent_of_goal"] == 50.0

    def test_fresh_profile_uses_the_default_goal_of_2500ml(self, client, auth_headers):
        """water_intake_goal_ml defaults to 2500 (a suggested target, unlike factual fields
        such as smoking_status which default to null) - see Phase 3's design note."""
        h = auth_headers()
        client.post("/api/hydration", headers=h, json={"water_intake_ml": 500})
        daily = client.get("/api/hydration/daily", headers=h).json()
        assert daily["goal_ml"] == 2500 and daily["percent_of_goal"] == 20.0

    def test_rejects_non_positive_and_excessive_amounts(self, client, auth_headers):
        h = auth_headers()
        assert client.post("/api/hydration", headers=h, json={"water_intake_ml": 0}).status_code == 422
        assert client.post("/api/hydration", headers=h, json={"water_intake_ml": 10000}).status_code == 422


class TestNutrition:
    def test_create_and_daily_summary(self, client, auth_headers):
        h = auth_headers()
        client.post("/api/nutrition", headers=h, json={"meal_type": "BREAKFAST", "food_item": "Oatmeal", "calories": 300})
        client.post("/api/nutrition", headers=h, json={"meal_type": "LUNCH", "food_item": "Salad", "calories": 400})
        daily = client.get("/api/nutrition/daily", headers=h).json()
        assert daily["total_calories"] == 700
        assert set(daily["meals_logged"]) == {"BREAKFAST", "LUNCH"}
        assert len(daily["entries"]) == 2

    def test_calories_optional(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/nutrition", headers=h, json={"meal_type": "SNACK", "food_item": "Apple"})
        assert r.status_code == 201 and r.json()["calories"] is None

    def test_invalid_meal_type_rejected(self, client, auth_headers):
        h = auth_headers()
        assert client.post("/api/nutrition", headers=h, json={"meal_type": "BRUNCH"}).status_code == 422


class TestWearableSimulator:
    def test_sync_simulated_and_one_click_deletion(self, client, auth_headers):
        h = auth_headers()
        today = date.today().isoformat()

        # 1. Create a regular user-logged exercise
        r_real = client.post("/api/exercise", headers=h, json={
            "exercise_type": "Real Gym Session",
            "duration_minutes": 45,
            "notes": "Real logged workout"
        })
        assert r_real.status_code == 201
        real_id = r_real.json()["id"]

        # 2. Simulate wearable sync with [DEMO SIMULATED] notes
        sync_payload = {
            "source": "apple_health",
            "exercises": [
                {
                    "exercise_date": today,
                    "exercise_type": "Simulated Walk",
                    "duration_minutes": 30,
                    "intensity": "MODERATE",
                    "notes": "[DEMO SIMULATED] Ingested from Apple HealthKit",
                }
            ],
            "sleeps": [
                {
                    "sleep_date": today,
                    "bedtime": "23:00:00",
                    "wake_time": "07:00:00",
                    "duration_hours": 8.0,
                    "sleep_quality": 8,
                    "notes": "[DEMO SIMULATED] Sleep stages from watch",
                }
            ],
        }
        r_sync = client.post("/api/wearables/sync", headers=h, json=sync_payload)
        assert r_sync.status_code == 200
        assert r_sync.json()["exercises_synced"] == 1
        assert r_sync.json()["sleeps_synced"] == 1

        # Verify they are present
        ex_list = client.get("/api/exercise", headers=h).json()
        assert len(ex_list) == 2
        sl_list = client.get("/api/sleep", headers=h).json()
        assert len(sl_list) == 1

        # 3. Call DELETE /api/wearables/simulated
        r_del = client.delete("/api/wearables/simulated", headers=h)
        assert r_del.status_code == 200
        del_data = r_del.json()
        assert del_data["status"] == "success"
        assert del_data["deleted_exercises"] == 1
        assert del_data["deleted_sleeps"] == 1

        # 4. Verify simulated records are deleted, but real record remains intact
        ex_after = client.get("/api/exercise", headers=h).json()
        assert len(ex_after) == 1
        assert ex_after[0]["id"] == real_id
        assert ex_after[0]["exercise_type"] == "Real Gym Session"

        sl_after = client.get("/api/sleep", headers=h).json()
        assert len(sl_after) == 0
