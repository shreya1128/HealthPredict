"""Phase F admin dashboard: access control, aggregate statistics, ML model view, user status + audit log."""

import json
from datetime import date, timedelta

import pytest

from app.models import AdminAuditLog, HealthAssessment, HealthPrediction, UserRole
from app.services import admin_service
from app.utils.timeutil import utcnow
from tests.conftest import PASSWORD, login

ADMIN = UserRole.ADMIN
ADMIN_GET_PATHS = [
    "/api/admin/stats/overview", "/api/admin/stats/risk", "/api/admin/stats/trends", "/api/admin/stats/usage",
    "/api/admin/ml/model", "/api/admin/audit-logs", "/api/admin/users",
]


def add_assessment(db, user, risk="LOW", score=80, days_ago=0, prob=None, ml_level=None):
    a = HealthAssessment(user_id=user.id, assessment_date=utcnow().date() - timedelta(days=days_ago), risk_category=risk, health_score=score,
                         created_at=utcnow() - timedelta(days=days_ago))
    db.add(a)
    db.commit()
    if prob is not None:
        db.add(HealthPrediction(assessment_id=a.id, prediction_score=prob, risk_level=ml_level, confidence_percent=50, model_version="gb-v1",
                                created_at=utcnow() - timedelta(days=days_ago)))
        db.commit()
    return a


class TestAccessControl:
    @pytest.mark.parametrize("path", ADMIN_GET_PATHS)
    def test_requires_authentication(self, client, path):
        assert client.get(path).status_code == 401

    @pytest.mark.parametrize("path", ADMIN_GET_PATHS)
    def test_forbidden_for_normal_users(self, client, auth_headers, path):
        assert client.get(path, headers=auth_headers("member@test.com")).status_code == 403

    def test_status_change_forbidden_for_normal_users_and_leaves_no_audit_row(self, client, auth_headers, make_user, db):
        target = make_user("t@test.com")
        h = auth_headers("member@test.com")
        assert client.patch(f"/api/admin/users/{target.id}/status", headers=h, json={"is_active": False}).status_code == 403
        assert db.query(AdminAuditLog).count() == 0
        db.refresh(target)
        assert target.is_active is True

    def test_deactivated_admin_loses_access_immediately(self, client, make_user, auth_headers, db):
        h = auth_headers("boss@test.com", role=ADMIN)
        assert client.get("/api/admin/stats/overview", headers=h).status_code == 200
        boss = db.query(__import__("app.models", fromlist=["User"]).User).filter_by(email="boss@test.com").one()
        boss.is_active = False
        db.commit()
        assert client.get("/api/admin/stats/overview", headers=h).status_code == 401


class TestUsersEndpoint:
    def test_role_filter_and_last_login_and_no_secrets(self, client, make_user, auth_headers):
        h = auth_headers("admin@test.com", role=ADMIN)
        make_user("m1@test.com")
        body = client.get("/api/admin/users?role=ADMIN", headers=h).json()
        assert [u["email"] for u in body["items"]] == ["admin@test.com"]
        assert body["items"][0]["last_login"] is not None  # the admin just logged in
        text = json.dumps(client.get("/api/admin/users", headers=h).json())
        for secret in ("password", "hash", "token"):
            assert secret not in text.lower()
        assert client.get("/api/admin/users?role=SUPERUSER", headers=h).status_code == 422


class TestOverview:
    def test_counts_are_exact(self, client, make_user, auth_headers, db):
        h = auth_headers("admin@test.com", role=ADMIN)
        m1 = make_user("m1@test.com")
        make_user("m2@test.com")
        make_user("gone@test.com", active=False)
        add_assessment(db, m1, days_ago=0)
        add_assessment(db, m1, days_ago=10)
        add_assessment(db, m1, days_ago=40)
        r = client.get("/api/admin/stats/overview", headers=h).json()
        assert r["users"]["total"] == 4 and r["users"]["active"] == 3 and r["users"]["inactive"] == 1 and r["users"]["admins"] == 1
        assert r["users"]["new_last_7_days"] == 4
        assert r["users"]["signed_in_last_7_days"] == 1  # only the admin has logged in
        assert r["users"]["never_signed_in"] == 3
        assert r["assessments"] == {"total": 3, "last_7_days": 1, "last_30_days": 2, "predictions_total": 0}

    def test_empty_system_is_all_zeros(self, client, auth_headers):
        r = client.get("/api/admin/stats/overview", headers=auth_headers("admin@test.com", role=ADMIN)).json()
        assert r["assessments"]["total"] == 0 and r["assessments"]["predictions_total"] == 0


class TestRiskStats:
    def test_uses_each_members_latest_assessment_and_excludes_admins(self, client, make_user, auth_headers, db):
        admin_h = auth_headers("admin@test.com", role=ADMIN)
        a, b, c = make_user("a@test.com"), make_user("b@test.com"), make_user("c@test.com")
        add_assessment(db, a, "HIGH", 40, days_ago=5)
        add_assessment(db, a, "LOW", 90, days_ago=1)  # a's latest is LOW: the old HIGH must not count
        add_assessment(db, b, "HIGH", 50)
        add_assessment(db, c, "MODERATE", 70)
        from app.models import User
        admin_user = db.query(User).filter_by(email="admin@test.com").one()
        add_assessment(db, admin_user, "HIGH", 10)  # admins are not part of the member population
        r = client.get("/api/admin/stats/risk", headers=admin_h).json()
        assert r["rule_based"] == {"LOW": 1, "MODERATE": 1, "HIGH": 1}
        assert r["members_with_assessment"] == 3
        assert r["members_without_assessment"] == 0
        assert r["average_health_score"] == 70.0  # (90 + 50 + 70) / 3

    def test_members_without_assessment_and_ml_breakdown(self, client, make_user, auth_headers, db):
        h = auth_headers("admin@test.com", role=ADMIN)
        a, b = make_user("a@test.com"), make_user("b@test.com")
        make_user("never@test.com")
        add_assessment(db, a, "LOW", 85, prob=0.2, ml_level="LOW")
        add_assessment(db, b, "HIGH", 45, prob=0.8, ml_level="HIGH")
        r = client.get("/api/admin/stats/risk", headers=h).json()
        assert r["members_with_assessment"] == 2 and r["members_without_assessment"] == 1
        assert r["ml"] == {"LOW": 1, "MODERATE": 0, "HIGH": 1}
        assert r["members_with_ml_prediction"] == 2
        assert r["average_ml_probability"] == 0.5

    def test_empty_system_has_null_averages_not_zero(self, client, auth_headers):
        r = client.get("/api/admin/stats/risk", headers=auth_headers("admin@test.com", role=ADMIN)).json()
        assert r["average_health_score"] is None and r["average_ml_probability"] is None
        assert r["members_with_assessment"] == 0


class TestTrends:
    def test_zero_filled_series_with_real_counts(self, client, make_user, auth_headers, db):
        h = auth_headers("admin@test.com", role=ADMIN)
        m = make_user("m@test.com")
        add_assessment(db, m, days_ago=0)
        add_assessment(db, m, days_ago=2)
        r = client.get("/api/admin/stats/trends?days=14", headers=h).json()
        assert r["days"] == 14 and len(r["points"]) == 14
        dates = [p["date"] for p in r["points"]]
        assert dates == sorted(dates) and dates[-1] == utcnow().date().isoformat()
        assert sum(p["assessments"] for p in r["points"]) == 2
        assert r["points"][-1]["assessments"] == 1 and r["points"][-3]["assessments"] == 1
        assert sum(p["new_users"] for p in r["points"]) == 2  # admin + member created today
        assert r["points"][-2]["assessments"] == 0

    @pytest.mark.parametrize("days", [0, 6, 366])
    def test_bounds(self, client, auth_headers, days):
        assert client.get(f"/api/admin/stats/trends?days={days}", headers=auth_headers("admin@test.com", role=ADMIN)).status_code == 422


class TestUsage:
    def test_feature_usage_and_platform_adherence_from_real_records(self, client, make_user, auth_headers, db):
        admin_h = auth_headers("admin@test.com", role=ADMIN)
        u1h = auth_headers("u1@test.com")
        client.post("/api/exercise", headers=u1h, json={"exercise_type": "Walk", "exercise_date": utcnow().date().isoformat(), "duration_minutes": 20, "intensity": "LOW"})
        med = client.post("/api/medicines", headers=u1h, json={"medicine_name": "M", "form": "TABLET", "frequency_unit": "DAILY", "time_of_day": ["08:00", "20:00"], "start_date": utcnow().date().isoformat()}).json()
        first = client.get(f"/api/medicines/{med['id']}/schedule?past_days=0&upcoming_days=0", headers=u1h).json()[0]
        client.post(f"/api/medicines/{med['id']}/schedule/{first['id']}/taken", headers=u1h)
        r = client.get("/api/admin/stats/usage?days=30", headers=admin_h).json()
        by = {f["feature"]: f for f in r["features"]}
        assert by["Exercise logs"] == {"feature": "Exercise logs", "records": 1, "users": 1}
        assert by["Medicines added"]["records"] == 1
        assert by["Sleep logs"]["records"] == 0 and by["Sleep logs"]["users"] == 0
        assert (r["medication_scheduled"], r["medication_taken"], r["medication_missed"]) == (2, 1, 0)
        assert r["medication_adherence_percent"] == 50.0

    def test_paused_medicines_and_inactive_users_are_excluded_from_adherence(self, client, auth_headers, db):
        admin_h = auth_headers("admin@test.com", role=ADMIN)
        u = auth_headers("u1@test.com")
        med = client.post("/api/medicines", headers=u, json={"medicine_name": "M", "form": "TABLET", "frequency_unit": "DAILY", "time_of_day": ["08:00"], "start_date": utcnow().date().isoformat()}).json()
        client.put(f"/api/medicines/{med['id']}", headers=u, json={"is_active": False})
        r = client.get("/api/admin/stats/usage", headers=admin_h).json()
        assert r["medication_scheduled"] == 0 and r["medication_adherence_percent"] is None


class TestMLModel:
    def test_metrics_come_straight_from_the_trained_artifacts(self, client, auth_headers):
        h = auth_headers("admin@test.com", role=ADMIN)
        from app.config.ml_settings import ML_MODEL_INFO_PATH
        info = json.loads(ML_MODEL_INFO_PATH.read_text())
        comparison = json.loads((ML_MODEL_INFO_PATH.parent / "model_comparison.json").read_text())
        r = client.get("/api/admin/ml/model", headers=h).json()
        assert r["available"] is True and r["model_name"] == info["model_name"]
        assert r["test_metrics"]["roc_auc"] == info["test_metrics"]["roc_auc"]
        assert r["test_metrics"]["accuracy"] == info["test_metrics"]["accuracy"]
        assert r["confusion_matrix"] == info["test_metrics"]["confusion_matrix"]
        assert r["train_rows"] == info["train_rows"] and r["test_rows"] == info["test_rows"]
        assert [c["name"] for c in r["comparison"]] == list(comparison)
        assert r["comparison"][0]["metrics"]["roc_auc"]["mean"] == comparison[r["comparison"][0]["name"]]["roc_auc"]["mean"]
        assert r["feature_columns"] == info["feature_columns"]

    def test_usage_block_counts_stored_predictions(self, client, make_user, auth_headers, db):
        h = auth_headers("admin@test.com", role=ADMIN)
        u = make_user("m@test.com")
        add_assessment(db, u, "HIGH", 40, prob=0.9, ml_level="HIGH")
        usage = client.get("/api/admin/ml/model", headers=h).json()["usage"]
        assert usage["predictions_total"] == 1 and usage["by_risk_level"]["HIGH"] == 1
        assert usage["by_model_version"] == {"gb-v1": 1} and usage["average_probability"] == 0.9

    def test_missing_artifacts_are_reported_honestly_not_invented(self, client, auth_headers, monkeypatch, tmp_path):
        monkeypatch.setattr(admin_service, "ML_MODEL_INFO_PATH", tmp_path / "model_info.json")
        r = client.get("/api/admin/ml/model", headers=auth_headers("admin@test.com", role=ADMIN)).json()
        assert r["available"] is False and r["test_metrics"] is None and r["comparison"] == []
        assert "train" in r["note"].lower()

    def test_corrupt_artifact_does_not_crash_the_page(self, client, auth_headers, monkeypatch, tmp_path):
        bad = tmp_path / "model_info.json"
        bad.write_text("{not json")
        monkeypatch.setattr(admin_service, "ML_MODEL_INFO_PATH", bad)
        assert client.get("/api/admin/ml/model", headers=auth_headers("admin@test.com", role=ADMIN)).json()["available"] is False


class TestUserStatusAndAudit:
    def test_deactivate_blocks_login_and_existing_sessions_and_is_audited(self, client, make_user, auth_headers, db):
        admin_h = auth_headers("admin@test.com", role=ADMIN)
        member_h = auth_headers("m@test.com")
        member_id = client.get("/api/auth/me", headers=member_h).json()["id"]
        r = client.patch(f"/api/admin/users/{member_id}/status", headers=admin_h, json={"is_active": False, "reason": "Abuse report #12"})
        assert r.status_code == 200 and r.json()["is_active"] is False
        assert client.get("/api/auth/me", headers=member_h).status_code == 401  # existing token stops working at once
        assert login(client, "m@test.com").status_code in (401, 403)
        log = db.query(AdminAuditLog).one()
        assert (log.action_type, log.target_entity_type, log.target_entity_id, log.status) == ("USER_DEACTIVATED", "USER", member_id, "SUCCESS")
        assert log.old_values == {"is_active": True} and log.new_values == {"is_active": False}
        assert log.details == "Abuse report #12" and log.ip_address

    def test_reactivate_restores_access_and_is_audited(self, client, make_user, auth_headers, db):
        admin_h = auth_headers("admin@test.com", role=ADMIN)
        target = make_user("m@test.com", active=False)
        assert login(client, "m@test.com").status_code in (401, 403)
        assert client.patch(f"/api/admin/users/{target.id}/status", headers=admin_h, json={"is_active": True}).json()["is_active"] is True
        assert login(client, "m@test.com").status_code == 200
        assert db.query(AdminAuditLog).one().action_type == "USER_REACTIVATED"

    def test_admin_cannot_change_own_status_and_the_attempt_is_recorded(self, client, auth_headers, db):
        h = auth_headers("admin@test.com", role=ADMIN)
        me = client.get("/api/auth/me", headers=h).json()["id"]
        r = client.patch(f"/api/admin/users/{me}/status", headers=h, json={"is_active": False})
        assert r.status_code == 400 and "own account" in r.json()["detail"]
        assert client.get("/api/auth/me", headers=h).status_code == 200
        log = db.query(AdminAuditLog).one()
        assert log.status == "FAILED" and log.new_values is None

    def test_one_admin_can_deactivate_another(self, client, make_user, auth_headers, db):
        h = auth_headers("a1@test.com", role=ADMIN)
        other = make_user("a2@test.com", role=ADMIN)
        assert client.patch(f"/api/admin/users/{other.id}/status", headers=h, json={"is_active": False}).status_code == 200
        assert client.get("/api/admin/stats/overview", headers=h).status_code == 200  # the acting admin keeps access

    def test_unknown_user_is_404_without_an_audit_row(self, client, auth_headers, db):
        h = auth_headers("admin@test.com", role=ADMIN)
        assert client.patch("/api/admin/users/999999/status", headers=h, json={"is_active": False}).status_code == 404
        assert db.query(AdminAuditLog).count() == 0

    def test_no_op_changes_nothing_and_writes_no_audit_entry(self, client, make_user, auth_headers, db):
        h = auth_headers("admin@test.com", role=ADMIN)
        target = make_user("m@test.com")
        assert client.patch(f"/api/admin/users/{target.id}/status", headers=h, json={"is_active": True}).status_code == 200
        assert db.query(AdminAuditLog).count() == 0

    def test_input_validation(self, client, make_user, auth_headers):
        h = auth_headers("admin@test.com", role=ADMIN)
        t = make_user("m@test.com")
        assert client.patch(f"/api/admin/users/{t.id}/status", headers=h, json={}).status_code == 422
        assert client.patch(f"/api/admin/users/{t.id}/status", headers=h, json={"is_active": False, "reason": "x" * 501}).status_code == 422

    def test_audit_log_listing_filters_pagination_and_order(self, client, make_user, auth_headers):
        h = auth_headers("admin@test.com", role=ADMIN)
        me = client.get("/api/auth/me", headers=h).json()["id"]
        users = [make_user(f"m{i}@test.com") for i in range(3)]
        for u in users:
            client.patch(f"/api/admin/users/{u.id}/status", headers=h, json={"is_active": False})
        client.patch(f"/api/admin/users/{users[0].id}/status", headers=h, json={"is_active": True})
        client.patch(f"/api/admin/users/{me}/status", headers=h, json={"is_active": False})  # blocked -> FAILED
        everything = client.get("/api/admin/audit-logs", headers=h).json()
        assert everything["total"] == 5
        assert everything["items"][0]["status"] == "FAILED"  # newest first
        assert everything["items"][0]["admin_email"] == "admin@test.com"
        assert client.get("/api/admin/audit-logs?action_type=USER_DEACTIVATED&status=SUCCESS", headers=h).json()["total"] == 3
        assert client.get("/api/admin/audit-logs?action_type=USER_REACTIVATED", headers=h).json()["total"] == 1
        assert client.get("/api/admin/audit-logs?status=FAILED", headers=h).json()["total"] == 1
        assert client.get(f"/api/admin/audit-logs?admin_id={me}", headers=h).json()["total"] == 5
        assert client.get("/api/admin/audit-logs?admin_id=999999", headers=h).json()["total"] == 0
        page2 = client.get("/api/admin/audit-logs?page=2&page_size=2", headers=h).json()
        assert len(page2["items"]) == 2 and page2["page"] == 2
        assert client.get("/api/admin/audit-logs?page_size=1000", headers=h).status_code == 422
        assert client.get("/api/admin/audit-logs?status=MAYBE", headers=h).status_code == 422

    def test_audit_entries_never_contain_credentials(self, client, make_user, auth_headers):
        h = auth_headers("admin@test.com", role=ADMIN)
        t = make_user("m@test.com")
        client.patch(f"/api/admin/users/{t.id}/status", headers=h, json={"is_active": False})
        text = json.dumps(client.get("/api/admin/audit-logs", headers=h).json()).lower()
        assert PASSWORD.lower() not in text and "password_hash" not in text and "authorization" not in text
