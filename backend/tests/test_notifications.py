"""Phase G: in-app notification inbox. Derivation from real records, idempotency, read state, ownership, concurrency."""

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import pytest

from app.config.database import SessionLocal
from app.models import HealthAssessment, Notification, User, UserRole
from app.services import notification_service
from app.utils.timeutil import utcnow

BASE = "/api/notifications"


def add_assessment(db, user, risk="LOW", score=80, days_ago=0):
    a = HealthAssessment(user_id=user.id, assessment_date=utcnow().date() - timedelta(days=days_ago), risk_category=risk, health_score=score,
                         created_at=utcnow() - timedelta(days=days_ago))
    db.add(a)
    db.commit()
    return a


def age_account(db, email, days):
    u = db.query(User).filter_by(email=email).one()
    u.created_at = utcnow() - timedelta(days=days)
    db.commit()
    return u


def types(client, h, **params):
    return [n["notification_type"] for n in client.get(BASE, headers=h, params=params).json()["items"]]


def refresh(client, h):
    r = client.post(f"{BASE}/refresh", headers=h)
    assert r.status_code == 200, r.text
    return r.json()["created"]


def daily_medicine(client, h, start=None, times=("08:00", "20:00"), name="Metformin"):
    return client.post("/api/medicines", headers=h, json={
        "medicine_name": name, "form": "TABLET", "frequency_unit": "DAILY", "time_of_day": list(times),
        "start_date": (start or utcnow().date()).isoformat()}).json()


class TestAccess:
    @pytest.mark.parametrize("method,path", [
        ("get", BASE), ("get", f"{BASE}/unread-count"), ("post", f"{BASE}/refresh"), ("post", f"{BASE}/read-all"), ("post", f"{BASE}/1/read"),
    ])
    def test_every_endpoint_requires_authentication(self, client, method, path):
        assert getattr(client, method)(path).status_code == 401

    def test_notifications_cannot_be_deleted(self, client, auth_headers, db):
        h = auth_headers("a@test.com")
        add_assessment(db, db.query(User).filter_by(email="a@test.com").one(), "LOW", 85)
        refresh(client, h)
        nid = client.get(BASE, headers=h).json()["items"][0]["id"]
        assert client.delete(f"{BASE}/{nid}", headers=h).status_code in (404, 405)  # no such route exists
        assert client.get(BASE, headers=h).json()["total"] == 1

    def test_admins_have_an_inbox_too(self, client, auth_headers):
        h = auth_headers("boss@test.com", role=UserRole.ADMIN)
        assert client.get(BASE, headers=h).status_code == 200


class TestNothingIsInvented:
    def test_a_brand_new_user_gets_nothing(self, client, auth_headers):
        h = auth_headers("new@test.com")
        assert refresh(client, h) == 0
        body = client.get(BASE, headers=h).json()
        assert body["items"] == [] and body["total"] == 0 and body["unread"] == 0
        assert client.get(f"{BASE}/unread-count", headers=h).json() == {"unread": 0}


class TestAssessmentCompleted:
    def test_one_notification_per_recent_assessment_with_its_real_score(self, client, make_user, auth_headers, db):
        h = auth_headers("a@test.com")
        u = db.query(User).filter_by(email="a@test.com").one()
        a = add_assessment(db, u, "MODERATE", 72.4)
        assert refresh(client, h) == 1
        n = client.get(BASE, headers=h).json()["items"][0]
        assert (n["notification_type"], n["related_entity_type"], n["related_entity_id"]) == ("ASSESSMENT_COMPLETED", "ASSESSMENT", a.id)
        assert "72" in n["message"] and "moderate" in n["message"] and n["is_read"] is False

    def test_high_risk_wording_is_informational_not_a_diagnosis(self, client, auth_headers, db):
        h = auth_headers("a@test.com")
        add_assessment(db, db.query(User).filter_by(email="a@test.com").one(), "HIGH", 38)
        refresh(client, h)
        msg = client.get(BASE, headers=h).json()["items"][0]["message"].lower()
        assert "not a diagnosis" in msg and "healthcare professional" in msg

    def test_old_assessments_are_not_backfilled(self, client, auth_headers, db):
        h = auth_headers("a@test.com")
        u = age_account(db, "a@test.com", 60)
        add_assessment(db, u, "LOW", 90, days_ago=10)
        refresh(client, h)
        assert "ASSESSMENT_COMPLETED" not in types(client, h)


class TestIdempotency:
    def test_refreshing_again_creates_nothing_new(self, client, auth_headers, db):
        h = auth_headers("a@test.com")
        add_assessment(db, db.query(User).filter_by(email="a@test.com").one(), "LOW", 85)
        assert refresh(client, h) == 1
        assert refresh(client, h) == 0
        assert client.get(BASE, headers=h).json()["total"] == 1

    def test_parallel_requests_smoke(self, client, auth_headers, db):
        """A smoke test only: HTTP calls are too quick to collide, so this does NOT prove the locking (see the next test)."""
        h = auth_headers("a@test.com")
        u = age_account(db, "a@test.com", 30)
        add_assessment(db, u, "LOW", 80, days_ago=1)
        add_assessment(db, u, "HIGH", 40, days_ago=2)
        daily_medicine(client, h, start=utcnow().date() - timedelta(days=2))
        with ThreadPoolExecutor(max_workers=8) as pool:
            created = list(pool.map(lambda _: client.post(f"{BASE}/refresh", headers=h).json()["created"], range(8)))
        assert sum(created) == 3 and db.query(Notification).count() == 3

    def test_the_race_is_closed_two_refreshes_inside_the_check_to_insert_window_cannot_duplicate(self, auth_headers, db, monkeypatch):
        """Deterministic race: a delay is injected right after the 'does it exist?' check, so BOTH refreshes would pass the
        check before either inserts. Without the per-user lock this produces duplicates (verified by removing the lock)."""
        auth_headers("a@test.com")
        u = age_account(db, "a@test.com", 30)
        add_assessment(db, u, "LOW", 80, days_ago=1)
        add_assessment(db, u, "LOW", 82, days_ago=2)
        real_exists = notification_service._exists

        def slow_exists(*args, **kwargs):
            result = real_exists(*args, **kwargs)
            time.sleep(0.4)  # widen the window between check and insert
            return result

        monkeypatch.setattr(notification_service, "_exists", slow_exists)
        results, barrier = [], threading.Barrier(2)

        def run():
            session = SessionLocal()
            try:
                user = session.get(User, u.id)
                barrier.wait()
                results.append(notification_service.refresh_notifications(session, user))
            finally:
                session.close()

        threads = [threading.Thread(target=run) for _ in range(2)]
        [t.start() for t in threads]
        [t.join(timeout=60) for t in threads]
        assert sorted(results) == [0, 2], results  # one refresh did the work, the other found it already done
        db.expire_all()
        assert db.query(Notification).filter_by(user_id=u.id).count() == 2


class TestMissedDoses:
    def test_groups_missed_doses_per_medicine_and_never_repeats(self, client, auth_headers):
        h = auth_headers("a@test.com")
        daily_medicine(client, h, start=utcnow().date() - timedelta(days=2))  # 2 past days x 2 doses
        assert refresh(client, h) == 1
        n = client.get(BASE, headers=h).json()["items"][0]
        assert n["notification_type"] == "MISSED_MEDICINE" and "4 doses" in n["message"] and "Metformin" in n["title"]
        assert refresh(client, h) == 0

    def test_nothing_when_doses_were_logged(self, client, auth_headers):
        h = auth_headers("a@test.com")
        med = daily_medicine(client, h, start=utcnow().date() - timedelta(days=1), times=("08:00",))
        for e in client.get(f"/api/medicines/{med['id']}/schedule?past_days=7&upcoming_days=0", headers=h).json():
            if e["scheduled_date"] < utcnow().date().isoformat():
                client.post(f"/api/medicines/{med['id']}/schedule/{e['id']}/taken", headers=h)
        assert refresh(client, h) == 0

    def test_skipped_doses_do_not_count_as_missed(self, client, auth_headers):
        h = auth_headers("a@test.com")
        med = daily_medicine(client, h, start=utcnow().date() - timedelta(days=1), times=("08:00",))
        for e in client.get(f"/api/medicines/{med['id']}/schedule?past_days=7&upcoming_days=0", headers=h).json():
            if e["scheduled_date"] < utcnow().date().isoformat():
                client.post(f"/api/medicines/{med['id']}/schedule/{e['id']}/skipped", headers=h, json={})
        assert refresh(client, h) == 0

    def test_todays_pending_doses_are_not_missed_yet(self, client, auth_headers):
        h = auth_headers("a@test.com")
        daily_medicine(client, h)  # starts today
        assert refresh(client, h) == 0

    def test_paused_medicines_do_not_notify(self, client, auth_headers):
        h = auth_headers("a@test.com")
        med = daily_medicine(client, h, start=utcnow().date() - timedelta(days=2))
        client.put(f"/api/medicines/{med['id']}", headers=h, json={"is_active": False})
        assert refresh(client, h) == 0

    def test_two_medicines_get_one_notification_each(self, client, auth_headers):
        h = auth_headers("a@test.com")
        daily_medicine(client, h, start=utcnow().date() - timedelta(days=1), times=("08:00",), name="A")
        daily_medicine(client, h, start=utcnow().date() - timedelta(days=1), times=("09:00",), name="B")
        assert refresh(client, h) == 2

    def test_doses_older_than_three_days_are_ignored(self, client, auth_headers):
        h = auth_headers("a@test.com")
        daily_medicine(client, h, start=utcnow().date() - timedelta(days=10), times=("08:00",))
        assert refresh(client, h) == 1  # only the last 3 days are reported
        assert "3 doses" in client.get(BASE, headers=h).json()["items"][0]["message"]


class TestReportsAndGoals:
    def test_weekly_report_ready(self, client, auth_headers):
        h = auth_headers("a@test.com")
        assert client.get("/api/reports/weekly", headers=h).status_code == 200
        assert refresh(client, h) == 1
        n = client.get(BASE, headers=h).json()["items"][0]
        assert n["notification_type"] == "WEEKLY_REPORT" and n["related_entity_type"] == "WEEKLY_REPORT" and n["related_entity_id"]
        assert refresh(client, h) == 0

    def test_only_completed_goals_notify(self, client, auth_headers):
        h = auth_headers("a@test.com")
        g = client.post("/api/goals", headers=h, json={"goal_type": "EXERCISE", "goal_description": "Move more", "target_value": 150,
                                                      "unit": "minutes/week", "start_date": utcnow().date().isoformat()}).json()
        assert refresh(client, h) == 0  # an active goal is not news
        assert client.put(f"/api/goals/{g['id']}", headers=h, json={"status": "COMPLETED"}).status_code == 200
        assert refresh(client, h) == 1
        n = client.get(BASE, headers=h).json()["items"][0]
        assert n["notification_type"] == "GOAL_PROGRESS" and "Move more" in n["message"]
        assert refresh(client, h) == 0


class TestCheckInReminder:
    def test_new_accounts_are_not_nagged(self, client, auth_headers):
        assert refresh(client, auth_headers("a@test.com")) == 0

    def test_established_account_with_no_assessment_is_invited_once_per_week(self, client, auth_headers, db):
        h = auth_headers("a@test.com")
        age_account(db, "a@test.com", 10)
        assert refresh(client, h) == 1
        n = client.get(BASE, headers=h).json()["items"][0]
        assert n["notification_type"] == "WELLNESS_REMINDER" and "haven't recorded" in n["message"]
        assert refresh(client, h) == 0

    def test_states_how_long_it_has_been(self, client, auth_headers, db):
        h = auth_headers("a@test.com")
        u = age_account(db, "a@test.com", 60)
        add_assessment(db, u, "LOW", 90, days_ago=9)
        refresh(client, h)
        assert "9 days" in client.get(BASE, params={"type": "WELLNESS_REMINDER"}, headers=h).json()["items"][0]["message"]

    def test_no_reminder_after_a_recent_assessment(self, client, auth_headers, db):
        h = auth_headers("a@test.com")
        u = age_account(db, "a@test.com", 60)
        add_assessment(db, u, "LOW", 90, days_ago=2)
        refresh(client, h)
        assert "WELLNESS_REMINDER" not in types(client, h)


class TestListingAndReadState:
    def seed(self, client, h, db):
        u = age_account(db, "a@test.com", 60)
        for i in range(5):
            add_assessment(db, u, "LOW", 80 + i, days_ago=i)  # 5 assessment notifications
        refresh(client, h)

    def test_pagination_order_and_filters(self, client, auth_headers, db):
        h = auth_headers("a@test.com")
        self.seed(client, h, db)
        everything = client.get(BASE, headers=h).json()
        assert everything["total"] == 5 and everything["unread"] == 5
        ids = [n["id"] for n in everything["items"]]
        assert ids == sorted(ids, reverse=True)  # newest first
        page2 = client.get(BASE, params={"page": 2, "page_size": 2}, headers=h).json()
        assert len(page2["items"]) == 2 and page2["page"] == 2 and page2["total"] == 5
        assert client.get(BASE, params={"type": "WEEKLY_REPORT"}, headers=h).json()["total"] == 0
        assert client.get(BASE, params={"type": "NOT_A_TYPE"}, headers=h).status_code == 422
        assert client.get(BASE, params={"page_size": 101}, headers=h).status_code == 422
        assert client.get(BASE, params={"page": 0}, headers=h).status_code == 422

    def test_mark_one_read_sets_timestamp_updates_counts_and_is_idempotent(self, client, auth_headers, db):
        h = auth_headers("a@test.com")
        self.seed(client, h, db)
        first = client.get(BASE, headers=h).json()["items"][0]
        r = client.post(f"{BASE}/{first['id']}/read", headers=h).json()
        assert r["is_read"] is True and r["read_at"]
        again = client.post(f"{BASE}/{first['id']}/read", headers=h).json()
        assert again["read_at"] == r["read_at"]  # a second call doesn't rewrite history
        assert client.get(f"{BASE}/unread-count", headers=h).json() == {"unread": 4}
        unread = client.get(BASE, params={"unread_only": True}, headers=h).json()
        assert unread["total"] == 4 and first["id"] not in [n["id"] for n in unread["items"]]

    def test_mark_all_read(self, client, auth_headers, db):
        h = auth_headers("a@test.com")
        self.seed(client, h, db)
        assert client.post(f"{BASE}/read-all", headers=h).json() == {"updated": 5}
        assert client.post(f"{BASE}/read-all", headers=h).json() == {"updated": 0}
        assert client.get(f"{BASE}/unread-count", headers=h).json() == {"unread": 0}

    def test_read_state_survives_a_refresh(self, client, auth_headers, db):
        h = auth_headers("a@test.com")
        self.seed(client, h, db)
        client.post(f"{BASE}/read-all", headers=h)
        refresh(client, h)  # must not resurrect or un-read anything
        assert client.get(f"{BASE}/unread-count", headers=h).json() == {"unread": 0}
        assert client.get(BASE, headers=h).json()["total"] == 5

    def test_unknown_id_is_404(self, client, auth_headers):
        assert client.post(f"{BASE}/999999/read", headers=auth_headers("a@test.com")).status_code == 404


class TestOwnership:
    def test_users_only_ever_see_and_change_their_own(self, client, auth_headers, db):
        ha, hb = auth_headers("a@test.com"), auth_headers("b@test.com")
        add_assessment(db, db.query(User).filter_by(email="a@test.com").one(), "LOW", 85)
        refresh(client, ha)
        a_note = client.get(BASE, headers=ha).json()["items"][0]

        assert client.get(BASE, headers=hb).json() == {"items": [], "total": 0, "unread": 0, "page": 1, "page_size": 20}
        assert client.post(f"{BASE}/{a_note['id']}/read", headers=hb).status_code == 404  # not 403: ids reveal nothing
        assert client.post(f"{BASE}/read-all", headers=hb).json() == {"updated": 0}
        assert client.get(f"{BASE}/unread-count", headers=ha).json() == {"unread": 1}  # untouched by B
        assert client.get(BASE, headers=ha).json()["items"][0]["is_read"] is False

    def test_messages_contain_no_other_peoples_data(self, client, auth_headers, db):
        ha, hb = auth_headers("alice@test.com"), auth_headers("bob@test.com")
        for email in ("alice@test.com", "bob@test.com"):
            add_assessment(db, db.query(User).filter_by(email=email).one(), "HIGH", 30)
        refresh(client, ha)
        refresh(client, hb)
        text = str(client.get(BASE, headers=ha).json()).lower()
        assert "bob" not in text and "@" not in text
