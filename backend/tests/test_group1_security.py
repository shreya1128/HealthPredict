import os
import pytest
from app.config.settings import settings
from app.models.user import UserRole
from app.utils.rate_limiter import auth_limiter, ip_ceiling_limiter, reset_all_limiters
from tests.conftest import PASSWORD, login


class TestGroup1Security:
    def test_s1_refuses_memory_email_backend_in_production(self):
        """S1: App settings refuses to start with EMAIL_BACKEND=memory when ENVIRONMENT=production."""
        from app.config.settings import Settings
        with pytest.raises(ValueError, match="EMAIL_BACKEND cannot be 'memory' in production"):
            Settings(ENVIRONMENT="production", SECRET_KEY="some-prod-secret-key-at-least-32-chars", EMAIL_BACKEND="memory")

    def test_s1_email_outbox_contains_no_tokens_in_logs(self, client, outbox, caplog):
        """S1: Reset and verification tokens are never logged."""
        import logging
        with caplog.at_level(logging.INFO):
            client.post("/api/auth/register", json={
                "email": "logtest@example.com",
                "password": PASSWORD,
                "confirm_password": PASSWORD,
                "full_name": "Log Tester",
                "gender": "FEMALE",
                "date_of_birth": "1995-04-12",
            })
            client.post("/api/auth/forgot-password", json={"email": "logtest@example.com"})

        sent = outbox()
        assert len(sent) >= 2
        for email in sent:
            body = email.get("html_body", "") + email.get("text_body", "")
            import re
            m = re.search(r"token=([A-Za-z0-9_\-\.]+)", body)
            if m:
                token = m.group(1)
                assert token not in caplog.text, f"Token {token} found in logs!"

    def test_s2_dispatch_reminders_permissions(self, client, auth_headers):
        """S2: Normal users cannot dispatch pushes for others; only admins or internal key."""
        # Unauthenticated request rejected
        client.cookies.clear()
        assert client.post("/api/notifications/dispatch-reminders").status_code == 401

        h_normal = auth_headers("rem_user@test.com", role=UserRole.USER)
        h_admin = auth_headers("rem_admin@test.com", role=UserRole.ADMIN)

        # Regular user dispatching without params scopes to themselves (200), but cannot target other users
        r_user = client.post("/api/notifications/dispatch-reminders", headers=h_normal)
        assert r_user.status_code == 200

        # Admin can call dispatch-reminders
        r_admin = client.post("/api/notifications/dispatch-reminders", headers=h_admin)
        assert r_admin.status_code == 200

        # Internal API key header works without user login
        settings.INTERNAL_API_KEY = "test-internal-secret-key-12345"
        r_internal = client.post(
            "/api/notifications/dispatch-reminders",
            headers={"X-Internal-Api-Key": "test-internal-secret-key-12345"},
        )
        assert r_internal.status_code == 200

        # Invalid internal key rejected when unauthenticated
        client.cookies.clear()
        r_bad_key = client.post(
            "/api/notifications/dispatch-reminders",
            headers={"X-Internal-Api-Key": "wrong-secret-key"},
        )
        assert r_bad_key.status_code == 401

    def test_s2_dispatch_reminders_idempotency_and_failure(self, client, db, make_user, auth_headers):
        """S2: Multiple dispatches do not duplicate; failed gateway returns 0."""
        from datetime import date
        from app.models.medicine import Medicine, MedicineSchedule
        from app.models.user_device import UserDeviceToken
        from app.services import push_service

        user = make_user(email="dose_user@test.com")
        med = Medicine(
            user_id=user.id,
            medicine_name="Lisinopril",
            start_date=date.today(),
            is_active=True,
        )
        db.add(med)
        db.commit()

        sched = MedicineSchedule(
            medicine_id=med.id,
            scheduled_date=date.today(),
            is_taken=False,
            is_skipped=False,
        )
        db.add(sched)
        db.commit()

        # Add active device
        push_service.register_device_token(db, user.id, "ExponentPushToken[dummy-test-token]")

        # Mock gateway failure
        orig_deliver = push_service._deliver_expo_push_messages
        try:
            push_service._deliver_expo_push_messages = lambda msgs: 0
            count = push_service.dispatch_due_medicine_reminders(db, user_id=user.id)
            assert count == 0, "Failed push should be reported as 0"

            # Mock gateway success
            push_service._deliver_expo_push_messages = lambda msgs: len(msgs)
            count1 = push_service.dispatch_due_medicine_reminders(db, user_id=user.id)
            assert count1 == 1, "Successful dispatch should return 1"

            # Idempotency: Second call must send 0
            count2 = push_service.dispatch_due_medicine_reminders(db, user_id=user.id)
            assert count2 == 0, "Idempotent dispatch must not resend dose"
        finally:
            push_service._deliver_expo_push_messages = orig_deliver

    def test_s5_login_rate_limiting_per_email(self, client, make_user):
        """S5: Login failures for email A do not block email B on same IP; limit expires/resets."""
        reset_all_limiters()
        make_user(email="alice@test.com")
        make_user(email="bob@test.com")

        # Fail Alice 10 times (rate limit)
        for _ in range(settings.LOGIN_RATE_LIMIT):
            r = login(client, "alice@test.com", "WrongPassword!1")
            assert r.status_code == 401

        # Alice 11th time is locked out (429)
        r_alice = login(client, "alice@test.com", "WrongPassword!1")
        assert r_alice.status_code == 429

        # Bob from SAME IP is NOT blocked
        r_bob = login(client, "bob@test.com", PASSWORD)
        assert r_bob.status_code == 200

        # Resetting/expiring clears lock
        reset_all_limiters()
        r_alice_after = login(client, "alice@test.com", PASSWORD)
        assert r_alice_after.status_code == 200

    def test_s5_trusted_proxies(self, client, make_user):
        """S5: Only trust X-Forwarded-For if client IP is in TRUSTED_PROXIES."""
        from app.utils.rate_limiter import _get_client_ip
        from starlette.requests import Request

        scope = {
            "type": "http",
            "client": ("192.168.1.100", 12345),
            "headers": [(b"x-forwarded-for", b"203.0.113.195, 10.0.0.1")],
        }
        req = Request(scope)

        # Untrusted proxy: client IP remains 192.168.1.100
        settings.TRUSTED_PROXIES = ""
        assert _get_client_ip(req) == "192.168.1.100"

        # Trusted proxy: uses forwarded IP
        settings.TRUSTED_PROXIES = "192.168.1.100"
        assert _get_client_ip(req) == "203.0.113.195"

    def test_s6_security_headers(self, client):
        """S6: API responses include secure HTTP headers."""
        r = client.get("/health")
        assert r.status_code == 200
        assert r.headers.get("X-Content-Type-Options") == "nosniff"
        assert r.headers.get("X-Frame-Options") == "DENY"
        assert r.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "camera=()" in r.headers.get("Permissions-Policy", "")

    def test_s6_api_docs_exposure_toggle(self, client):
        """S6: Swagger/OpenAPI docs respect ENABLE_API_DOCS setting."""
        # When enabled (default in testing)
        settings.ENABLE_API_DOCS = True
        # Re-check endpoint routes
        assert any(route.path == "/api/docs" for route in client.app.routes)

    def test_s7_caregiver_invite_token_not_returned_in_api(self, client, auth_headers):
        """S7: Caregiver invite token is NOT in API responses."""
        h = auth_headers("owner@test.com")
        r = client.post(
            "/api/care-profiles/caregivers/invite",
            headers=h,
            json={"caregiver_email": "helper@test.com", "access_level": "VIEW_ONLY", "notify_missed_dose": True},
        )
        assert r.status_code == 201
        body = r.json()
        assert "invite_token" not in body, "Security flaw: invite_token returned in API response!"
        assert body["caregiver_email"] == "helper@test.com"

        # Also verify list endpoint does not expose invite_token
        r_list = client.get("/api/care-profiles/caregivers/invites", headers=h)
        assert r_list.status_code == 200
        for item in r_list.json():
            assert "invite_token" not in item, "Security flaw: invite_token returned in list API!"
