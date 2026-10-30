from datetime import date, timedelta


def create_daily(client, h, **overrides):
    payload = {
        "medicine_name": "Metformin", "dosage": 500, "dosage_unit": "mg", "form": "TABLET",
        "frequency_unit": "DAILY", "time_of_day": ["08:00", "20:00"],
        "start_date": date.today().isoformat(),
    }
    payload.update(overrides)
    r = client.post("/api/medicines", headers=h, json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_requires_auth(client):
    assert client.get("/api/medicines").status_code == 401
    assert client.post("/api/medicines", json={}).status_code == 401


class TestCreateValidation:
    def test_blank_name_rejected(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/medicines", headers=h, json={
            "medicine_name": "   ", "frequency_unit": "DAILY", "time_of_day": ["08:00"],
            "start_date": date.today().isoformat()})
        assert r.status_code == 422

    def test_invalid_time_format_rejected(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/medicines", headers=h, json={
            "medicine_name": "X", "frequency_unit": "DAILY", "time_of_day": ["8am"],
            "start_date": date.today().isoformat()})
        assert r.status_code == 422

    def test_daily_without_time_of_day_rejected(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/medicines", headers=h, json={
            "medicine_name": "X", "frequency_unit": "DAILY", "time_of_day": [],
            "start_date": date.today().isoformat()})
        assert r.status_code == 422

    def test_as_needed_with_time_of_day_rejected(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/medicines", headers=h, json={
            "medicine_name": "X", "frequency_unit": "AS_NEEDED", "time_of_day": ["08:00"],
            "start_date": date.today().isoformat()})
        assert r.status_code == 422

    def test_end_date_before_start_date_rejected(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/medicines", headers=h, json={
            "medicine_name": "X", "frequency_unit": "DAILY", "time_of_day": ["08:00"],
            "start_date": date.today().isoformat(),
            "end_date": (date.today() - timedelta(days=1)).isoformat()})
        assert r.status_code == 422

    def test_duplicate_times_rejected(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/medicines", headers=h, json={
            "medicine_name": "X", "frequency_unit": "DAILY", "time_of_day": ["08:00", "08:00"],
            "start_date": date.today().isoformat()})
        assert r.status_code == 422


class TestCreateAndSchedule:
    def test_create_generates_schedule_for_each_time_slot_today(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h, time_of_day=["08:00", "14:00", "20:00"])
        sched = client.get(f"/api/medicines/{med['id']}/schedule?past_days=0&upcoming_days=0", headers=h).json()
        assert len(sched) == 3
        assert [s["scheduled_time"] for s in sched] == ["08:00:00", "14:00:00", "20:00:00"]
        assert all(not s["is_taken"] and not s["is_skipped"] for s in sched)

    def test_as_needed_generates_no_schedule(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h, frequency_unit="AS_NEEDED", time_of_day=[])
        sched = client.get(f"/api/medicines/{med['id']}/schedule?past_days=0&upcoming_days=90", headers=h).json()
        assert sched == []

    def test_frequency_set_from_time_of_day_length(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h, time_of_day=["08:00", "14:00", "20:00"])
        assert med["time_of_day"] == ["08:00", "14:00", "20:00"]


class TestListGetDeleteOwnership:
    def test_list_and_get(self, client, auth_headers):
        h = auth_headers()
        created = create_daily(client, h)
        assert client.get("/api/medicines", headers=h).json()[0]["id"] == created["id"]
        assert client.get(f"/api/medicines/{created['id']}", headers=h).json()["id"] == created["id"]

    def test_get_nonexistent_404(self, client, auth_headers):
        assert client.get("/api/medicines/999999", headers=auth_headers()).status_code == 404

    def test_ownership_isolation(self, client, auth_headers):
        a = auth_headers("a@test.com")
        b = auth_headers("b@test.com")
        med = create_daily(client, a)
        assert client.get(f"/api/medicines/{med['id']}", headers=b).status_code == 404
        assert client.put(f"/api/medicines/{med['id']}", headers=b, json={"notes": "x"}).status_code == 404
        assert client.delete(f"/api/medicines/{med['id']}", headers=b).status_code == 404
        assert client.get("/api/medicines", headers=b).json() == []

    def test_delete_cascades_schedule(self, client, auth_headers, db):
        from app.models import MedicineSchedule
        h = auth_headers()
        med = create_daily(client, h)
        assert db.query(MedicineSchedule).filter_by(medicine_id=med["id"]).count() > 0
        assert client.delete(f"/api/medicines/{med['id']}", headers=h).status_code == 204
        # The client's HTTP call commits through a *different* session; under MySQL's default
        # REPEATABLE READ, this fixture's session is still looking at the snapshot from the
        # query above unless its transaction is explicitly ended first.
        db.commit()
        assert db.query(MedicineSchedule).filter_by(medicine_id=med["id"]).count() == 0

    def test_active_only_filter(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h)
        client.put(f"/api/medicines/{med['id']}", headers=h, json={"is_active": False})
        assert len(client.get("/api/medicines?active_only=true", headers=h).json()) == 0
        assert len(client.get("/api/medicines", headers=h).json()) == 1


class TestUpdateAndScheduleRegeneration:
    def test_non_schedule_field_update_leaves_schedule_untouched(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h)
        before = {s["id"] for s in client.get(f"/api/medicines/{med['id']}/schedule?upcoming_days=90", headers=h).json()}
        client.put(f"/api/medicines/{med['id']}", headers=h, json={"notes": "take with food"})
        after = {s["id"] for s in client.get(f"/api/medicines/{med['id']}/schedule?upcoming_days=90", headers=h).json()}
        assert before == after

    def test_changing_time_of_day_regenerates_future_schedule(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h, time_of_day=["08:00"])
        client.put(f"/api/medicines/{med['id']}", headers=h, json={"time_of_day": ["09:00", "21:00"]})
        sched = client.get(f"/api/medicines/{med['id']}/schedule?past_days=0&upcoming_days=0", headers=h).json()
        assert sorted(s["scheduled_time"] for s in sched) == ["09:00:00", "21:00:00"]

    def test_taken_entries_survive_schedule_regeneration(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h, time_of_day=["08:00"])
        today_entry = client.get(f"/api/medicines/{med['id']}/schedule?past_days=0&upcoming_days=0", headers=h).json()[0]
        client.post(f"/api/medicines/{med['id']}/schedule/{today_entry['id']}/taken", headers=h)
        client.put(f"/api/medicines/{med['id']}", headers=h, json={"time_of_day": ["10:00"]})
        sched = client.get(f"/api/medicines/{med['id']}/schedule?past_days=0&upcoming_days=0", headers=h).json()
        # the taken 08:00 entry must survive untouched; a new pending 10:00 entry is added alongside it
        assert any(s["id"] == today_entry["id"] and s["is_taken"] for s in sched)
        assert any(s["scheduled_time"] == "10:00:00" for s in sched)

    def test_update_rejects_unknown_fields(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h)
        assert client.put(f"/api/medicines/{med['id']}", headers=h, json={"user_id": 999}).status_code == 422


class TestTakenAndSkipped:
    def test_mark_taken(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h, time_of_day=["08:00"])
        entry = client.get(f"/api/medicines/{med['id']}/schedule?past_days=0&upcoming_days=0", headers=h).json()[0]
        r = client.post(f"/api/medicines/{med['id']}/schedule/{entry['id']}/taken", headers=h)
        assert r.status_code == 200
        body = r.json()
        assert body["is_taken"] is True and body["is_skipped"] is False and body["taken_at"] is not None

    def test_mark_skipped_with_reason(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h, time_of_day=["08:00"])
        entry = client.get(f"/api/medicines/{med['id']}/schedule?past_days=0&upcoming_days=0", headers=h).json()[0]
        r = client.post(f"/api/medicines/{med['id']}/schedule/{entry['id']}/skipped", headers=h,
                        json={"reason": "felt nauseous"})
        assert r.status_code == 200
        body = r.json()
        assert body["is_skipped"] is True and body["is_taken"] is False
        assert body["skipped_reason"] == "felt nauseous"

    def test_taken_then_skipped_clears_taken(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h, time_of_day=["08:00"])
        entry = client.get(f"/api/medicines/{med['id']}/schedule?past_days=0&upcoming_days=0", headers=h).json()[0]
        client.post(f"/api/medicines/{med['id']}/schedule/{entry['id']}/taken", headers=h)
        r = client.post(f"/api/medicines/{med['id']}/schedule/{entry['id']}/skipped", headers=h, json={})
        assert r.json()["is_taken"] is False and r.json()["is_skipped"] is True

    def test_wrong_medicine_id_for_schedule_entry_404s(self, client, auth_headers):
        h = auth_headers()
        med1 = create_daily(client, h, medicine_name="A")
        med2 = create_daily(client, h, medicine_name="B")
        entry = client.get(f"/api/medicines/{med1['id']}/schedule?past_days=0&upcoming_days=0", headers=h).json()[0]
        assert client.post(f"/api/medicines/{med2['id']}/schedule/{entry['id']}/taken", headers=h).status_code == 404

    def test_other_user_cannot_mark_taken(self, client, auth_headers):
        a = auth_headers("a@test.com")
        b = auth_headers("b@test.com")
        med = create_daily(client, a, time_of_day=["08:00"])
        entry = client.get(f"/api/medicines/{med['id']}/schedule?past_days=0&upcoming_days=0", headers=a).json()[0]
        assert client.post(f"/api/medicines/{med['id']}/schedule/{entry['id']}/taken", headers=b).status_code == 404


class TestAdherence:
    def test_adherence_with_no_history_is_well_defined(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h, time_of_day=["08:00"], start_date=(date.today() + timedelta(days=5)).isoformat())
        r = client.get(f"/api/medicines/{med['id']}/adherence?days=30", headers=h).json()
        assert r["scheduled_count"] == 0 and r["adherence_percent"] == 0.0

    def test_adherence_percent_calculation(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h, time_of_day=["08:00", "20:00"])
        entries = client.get(f"/api/medicines/{med['id']}/schedule?past_days=0&upcoming_days=0", headers=h).json()
        client.post(f"/api/medicines/{med['id']}/schedule/{entries[0]['id']}/taken", headers=h)
        client.post(f"/api/medicines/{med['id']}/schedule/{entries[1]['id']}/skipped", headers=h, json={})
        r = client.get(f"/api/medicines/{med['id']}/adherence?days=30", headers=h).json()
        assert r["scheduled_count"] == 2 and r["taken_count"] == 1 and r["skipped_count"] == 1
        assert r["adherence_percent"] == 50.0

    def test_adherence_days_bounds(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h)
        assert client.get(f"/api/medicines/{med['id']}/adherence?days=0", headers=h).status_code == 422
        assert client.get(f"/api/medicines/{med['id']}/adherence?days=1000", headers=h).status_code == 422


class TestTodaySchedule:
    def test_today_schedule_spans_multiple_medicines(self, client, auth_headers):
        h = auth_headers()
        create_daily(client, h, medicine_name="Metformin", time_of_day=["08:00"])
        create_daily(client, h, medicine_name="Lisinopril", time_of_day=["09:00"])
        today = client.get("/api/medicines/today", headers=h).json()
        assert {e["medicine_name"] for e in today} == {"Metformin", "Lisinopril"}
        assert [e["scheduled_time"] for e in today] == sorted(e["scheduled_time"] for e in today)

    def test_today_schedule_excludes_paused_medicines(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h, time_of_day=["08:00"])
        client.put(f"/api/medicines/{med['id']}", headers=h, json={"is_active": False})
        assert client.get("/api/medicines/today", headers=h).json() == []

    def test_today_schedule_only_shows_own_medicines(self, client, auth_headers):
        a = auth_headers("a@test.com")
        b = auth_headers("b@test.com")
        create_daily(client, a, time_of_day=["08:00"])
        assert client.get("/api/medicines/today", headers=b).json() == []


class TestOverallAdherence:
    URL = "/api/medicines/adherence/overall"

    def test_requires_auth(self, client):
        assert client.get(self.URL).status_code == 401

    def test_nothing_to_measure_is_null_not_zero(self, client, auth_headers):
        h = auth_headers()
        r = client.get(self.URL, headers=h).json()
        assert r == {"days": 30, "scheduled_count": 0, "taken_count": 0, "skipped_count": 0,
                     "missed_count": 0, "adherence_percent": None}

    def test_combines_all_active_medicines(self, client, auth_headers):
        h = auth_headers()
        a = create_daily(client, h, medicine_name="A", time_of_day=["08:00", "20:00"])
        b = create_daily(client, h, medicine_name="B", time_of_day=["09:00", "21:00"])
        for med in (a, b):
            entries = client.get(f"/api/medicines/{med['id']}/schedule?past_days=0&upcoming_days=0", headers=h).json()
            client.post(f"/api/medicines/{med['id']}/schedule/{entries[0]['id']}/taken", headers=h)
        r = client.get(self.URL, headers=h).json()
        assert (r["scheduled_count"], r["taken_count"], r["skipped_count"], r["missed_count"]) == (4, 2, 0, 0)
        assert r["adherence_percent"] == 50.0

    def test_agrees_with_the_per_medicine_endpoint(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h, time_of_day=["08:00", "20:00"])
        entries = client.get(f"/api/medicines/{med['id']}/schedule?past_days=0&upcoming_days=0", headers=h).json()
        client.post(f"/api/medicines/{med['id']}/schedule/{entries[0]['id']}/taken", headers=h)
        client.post(f"/api/medicines/{med['id']}/schedule/{entries[1]['id']}/skipped", headers=h, json={})
        one = client.get(f"/api/medicines/{med['id']}/adherence?days=30", headers=h).json()
        total = client.get(self.URL, headers=h).json()
        for k in ("scheduled_count", "taken_count", "skipped_count", "missed_count", "adherence_percent"):
            assert total[k] == one[k]

    def test_past_unacted_doses_count_as_missed(self, client, auth_headers):
        h = auth_headers()
        create_daily(client, h, time_of_day=["08:00"], start_date=(date.today() - timedelta(days=2)).isoformat())
        r = client.get(self.URL + "?days=30", headers=h).json()
        assert r["scheduled_count"] == 3 and r["missed_count"] == 2 and r["taken_count"] == 0
        assert r["adherence_percent"] == 0.0

    def test_paused_medicines_are_excluded(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h)
        client.put(f"/api/medicines/{med['id']}", headers=h, json={"is_active": False})
        assert client.get(self.URL, headers=h).json()["adherence_percent"] is None
        client.put(f"/api/medicines/{med['id']}", headers=h, json={"is_active": True})
        assert client.get(self.URL, headers=h).json()["scheduled_count"] == 2

    def test_other_users_data_is_never_included(self, client, auth_headers):
        h1, h2 = auth_headers("one@test.com"), auth_headers("two@test.com")
        create_daily(client, h1)
        assert client.get(self.URL, headers=h2).json()["scheduled_count"] == 0

    def test_days_bounds(self, client, auth_headers):
        h = auth_headers()
        assert client.get(self.URL + "?days=0", headers=h).status_code == 422
        assert client.get(self.URL + "?days=1000", headers=h).status_code == 422

    def test_route_does_not_shadow_medicine_id_routes(self, client, auth_headers):
        h = auth_headers()
        med = create_daily(client, h)
        assert client.get(f"/api/medicines/{med['id']}", headers=h).status_code == 200
