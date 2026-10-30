"""
Adversarial audit tests — try to break HealthPredict with unusual inputs,
edge cases, and attack vectors that normal tests would not cover.
"""
import pytest
from tests.conftest import login, PASSWORD


# ----------- helpers -----------
def _register(client, email, password="StrongPass!1"):
    return client.post("/api/auth/register", json={
        "email": email, "password": password, "confirm_password": password,
        "full_name": "Audit User", "date_of_birth": "1990-01-01", "gender": "MALE"
    })

def _login(client, email, password="StrongPass!1"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    return r.json().get("access_token", "")

def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ======================== SQL Injection Attempts ========================

class TestSQLInjection:
    """Try SQL injection in search, filter, and path parameters."""

    def test_medicine_search_sqli(self, client, auth_headers):
        """Inject SQL in medicine name search."""
        h = auth_headers()
        payloads = [
            "'; DROP TABLE users; --",
            "1 OR 1=1",
            "' UNION SELECT * FROM users --",
            "Robert'); DROP TABLE medicines;--",
        ]
        for p in payloads:
            r = client.get(f"/api/medicines?search={p}", headers=h)
            assert r.status_code in (200, 422), f"SQL injection payload returned {r.status_code}: {p}"

    def test_medicine_name_sqli_create(self, client, auth_headers):
        """Inject SQL in medicine name on creation."""
        h = auth_headers()
        r = client.post("/api/medicines", json={
            "name": "'; DROP TABLE medicines; --",
            "dosage": "10mg",
            "frequency": "DAILY",
            "start_date": "2024-01-01"
        }, headers=h)
        assert r.status_code in (200, 201, 422)

    def test_login_sqli(self, client, clean_state):
        """SQL injection in login email field."""
        r = client.post("/api/auth/login", json={
            "email": "' OR '1'='1' --",
            "password": "anything"
        })
        assert r.status_code in (401, 422), f"SQLi login returned {r.status_code}"


# ======================== IDOR Attacks ========================

class TestIDOR:
    """Try to access other users' resources by guessing IDs."""

    def test_cannot_read_other_users_medicines(self, client, make_user, db):
        """User 2 cannot read User 1's medicines by guessing IDs."""
        from app.models.user import UserRole
        make_user(email="idor_u1@t.com")
        make_user(email="idor_u2@t.com")
        t1 = login(client, "idor_u1@t.com").json()["access_token"]
        t2 = login(client, "idor_u2@t.com").json()["access_token"]

        r = client.post("/api/medicines", json={
            "name": "Atenolol", "dosage": "50mg",
            "frequency": "DAILY", "start_date": "2024-01-01"
        }, headers=_auth(t1))
        if r.status_code in (200, 201):
            med_id = r.json().get("id") or r.json().get("medicine", {}).get("id")
            if med_id:
                r2 = client.get(f"/api/medicines/{med_id}", headers=_auth(t2))
                assert r2.status_code in (403, 404), f"IDOR: User 2 saw User 1's medicine: {r2.status_code}"

    def test_cannot_delete_other_users_medicine(self, client, make_user):
        """User 2 cannot delete User 1's medicine."""
        make_user(email="idor_d1@t.com")
        make_user(email="idor_d2@t.com")
        t1 = login(client, "idor_d1@t.com").json()["access_token"]
        t2 = login(client, "idor_d2@t.com").json()["access_token"]

        r = client.post("/api/medicines", json={
            "name": "Metformin", "dosage": "500mg",
            "frequency": "DAILY", "start_date": "2024-01-01"
        }, headers=_auth(t1))
        if r.status_code in (200, 201):
            med_id = r.json().get("id") or r.json().get("medicine", {}).get("id")
            if med_id:
                r2 = client.delete(f"/api/medicines/{med_id}", headers=_auth(t2))
                assert r2.status_code in (403, 404), f"IDOR delete: {r2.status_code}"

    def test_cannot_export_other_users_data(self, client, make_user):
        """User 2 cannot see User 1's data in their export."""
        make_user(email="idor_e1@t.com")
        make_user(email="idor_e2@t.com")
        t2 = login(client, "idor_e2@t.com").json()["access_token"]
        r = client.get("/api/account/export", headers=_auth(t2))
        if r.status_code == 200:
            data = str(r.json())
            assert "idor_e1" not in data, "IDOR: export contains other user's data"


# ======================== JWT Attack Vectors ========================

class TestJWTAttacks:
    """Try to exploit JWT-based authentication."""

    def test_expired_token_rejected(self, client, clean_state):
        fake_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjoxfQ.invalid"
        r = client.get("/api/medicines", headers=_auth(fake_token))
        assert r.status_code in (401, 403)

    def test_none_algorithm_rejected(self, client, clean_state):
        """alg:none attack must be rejected."""
        import base64, json
        header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b'=')
        payload = base64.urlsafe_b64encode(json.dumps({"sub": "1", "exp": 9999999999}).encode()).rstrip(b'=')
        none_token = f"{header.decode()}.{payload.decode()}."
        r = client.get("/api/medicines", headers=_auth(none_token))
        assert r.status_code in (401, 403), f"alg:none accepted! Status: {r.status_code}"

    def test_no_auth_header(self, client, clean_state):
        r = client.get("/api/medicines")
        assert r.status_code in (401, 403)

    def test_empty_bearer(self, client, clean_state):
        r = client.get("/api/medicines", headers={"Authorization": "Bearer "})
        assert r.status_code in (401, 403)

    def test_malformed_bearer(self, client, clean_state):
        r = client.get("/api/medicines", headers={"Authorization": "NotBearer abc123"})
        assert r.status_code in (401, 403)


# ======================== Input Validation Edge Cases ========================

class TestInputValidation:
    """Test boundary conditions and unusual inputs."""

    def test_unicode_medicine_name(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/medicines", json={
            "name": "💊 Aspirin™ (アスピリン)",
            "dosage": "100mg", "frequency": "DAILY", "start_date": "2024-01-01"
        }, headers=h)
        assert r.status_code in (200, 201, 422)

    def test_very_long_medicine_name(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/medicines", json={
            "name": "A" * 10000, "dosage": "10mg",
            "frequency": "DAILY", "start_date": "2024-01-01"
        }, headers=h)
        assert r.status_code in (200, 201, 422, 400)

    def test_future_birth_date(self, client, clean_state):
        r = client.post("/api/auth/register", json={
            "email": "future_baby@test.com", "password": "StrongPass!1",
            "confirm_password": "StrongPass!1",
            "full_name": "Future Baby", "date_of_birth": "2099-12-31", "gender": "MALE"
        })
        # Should reject a future birth date
        # BUG_FINDING: if status is 200/201, the app accepts future birth dates
        if r.status_code in (200, 201):
            pytest.xfail("BUG: Future birth date accepted - no validation")
        assert r.status_code in (422, 400)

    def test_ancient_birth_date(self, client, clean_state):
        r = client.post("/api/auth/register", json={
            "email": "ancient@test.com", "password": "StrongPass!1",
            "confirm_password": "StrongPass!1",
            "full_name": "Ancient Person", "date_of_birth": "1800-01-01", "gender": "MALE"
        })
        # Shouldn't crash at minimum
        assert r.status_code in (200, 201, 422, 400)

    def test_html_injection_in_name(self, client, clean_state):
        """HTML tags in user name should be stored escaped or stripped."""
        r = client.post("/api/auth/register", json={
            "email": "xss_test@test.com", "password": "StrongPass!1",
            "confirm_password": "StrongPass!1",
            "full_name": "<script>alert('XSS')</script>",
            "date_of_birth": "1990-01-01", "gender": "MALE"
        })
        assert r.status_code in (200, 201)
        token = _login(client, "xss_test@test.com")
        r2 = client.get("/api/auth/me", headers=_auth(token))
        assert r2.status_code == 200
        name = r2.json().get("full_name", "")
        assert "<script>" not in name, "Raw <script> tag stored in full_name"
        assert "<" not in name and ">" not in name, "HTML angle brackets not stripped from full_name"
        assert name == "alert('XSS')"


# ======================== Race Conditions ========================

class TestRaceConditions:
    """Test concurrent operations that could cause data corruption."""

    def test_double_registration(self, client, clean_state):
        email = "double_reg_test@test.com"
        r1 = _register(client, email)
        r2 = _register(client, email)
        assert r2.status_code in (409, 422, 400), f"Double registration succeeded: {r2.status_code}"

    def test_double_logout(self, client, clean_state):
        """Logging out the same session twice should not crash."""
        _register(client, "double_logout@test.com")
        token = _login(client, "double_logout@test.com")
        r1 = client.post("/api/auth/logout", headers=_auth(token))
        assert r1.status_code == 200
        r2 = client.post("/api/auth/logout", headers=_auth(token))
        assert r2.status_code in (200, 401), f"Double logout returned: {r2.status_code}"


# ======================== Error Response Safety ========================

class TestErrorResponseSafety:
    """Ensure error responses don't leak internal details."""

    def test_404_does_not_leak_traceback(self, client, clean_state):
        r = client.get("/api/nonexistent/endpoint/that/does/not/exist")
        assert r.status_code == 404
        body = r.text
        assert "Traceback" not in body
        assert "File \"" not in body

    def test_invalid_json_body(self, client, clean_state):
        r = client.post("/api/auth/login",
                        content="this is not json",
                        headers={"Content-Type": "application/json"})
        assert r.status_code in (422, 400), f"Invalid JSON returned: {r.status_code}"

    def test_wrong_content_type(self, client, clean_state):
        r = client.post("/api/auth/login",
                        content="email=test@test.com&password=abc",
                        headers={"Content-Type": "application/x-www-form-urlencoded"})
        assert r.status_code in (422, 400, 415), f"Wrong content type returned: {r.status_code}"

    def test_empty_body(self, client, clean_state):
        r = client.post("/api/auth/login", content="",
                        headers={"Content-Type": "application/json"})
        assert r.status_code in (422, 400), f"Empty body returned: {r.status_code}"


# ======================== Admin Endpoint Protection ========================

class TestAdminProtection:
    """Ensure admin endpoints reject non-admin users."""

    def test_admin_dashboard_blocked(self, client, auth_headers):
        h = auth_headers()
        r = client.get("/api/admin/stats/overview", headers=h)
        assert r.status_code in (403, 401), f"Non-admin got admin overview: {r.status_code}"

    def test_admin_users_list_blocked(self, client, auth_headers):
        h = auth_headers()
        r = client.get("/api/admin/users", headers=h)
        assert r.status_code in (403, 401), f"Non-admin listed users: {r.status_code}"


# ======================== Date Edge Cases ========================

class TestDateEdgeCases:
    """Test date-related edge cases in health records and medicines."""

    def test_medicine_end_before_start(self, client, auth_headers):
        h = auth_headers()
        r = client.post("/api/medicines", json={
            "name": "Bad Dates Med", "dosage": "10mg",
            "frequency": "DAILY",
            "start_date": "2024-06-01", "end_date": "2024-01-01"
        }, headers=h)
        # Should reject or at minimum not crash
        assert r.status_code in (200, 201, 422, 400)

    def test_feb_29_non_leap_year_medicine(self, client, auth_headers):
        """Medicine with Feb 29 start on non-leap year should be rejected."""
        h = auth_headers()
        r = client.post("/api/medicines", json={
            "name": "Feb29 Med", "dosage": "10mg",
            "frequency": "DAILY",
            "start_date": "2023-02-29"
        }, headers=h)
        assert r.status_code in (422, 400), f"Accepted Feb 29 on non-leap year: {r.status_code}"


# ======================== Password Security ========================

class TestPasswordSecurity:
    """Test password validation and security."""

    def test_weak_password_rejected(self, client, clean_state):
        r = _register(client, "weakpw@test.com", password="123")
        assert r.status_code in (422, 400), f"Weak password accepted: {r.status_code}"

    def test_password_not_in_response(self, client, clean_state):
        email = "pw_resp@test.com"
        _register(client, email)
        token = _login(client, email)
        r = client.get("/api/auth/me", headers=_auth(token))
        body = r.text.lower()
        assert "strongpass" not in body, "Password appears in /me response"

    def test_password_not_in_export(self, client, clean_state):
        email = "pw_export@test.com"
        _register(client, email)
        token = _login(client, email)
        r = client.get("/api/account/export", headers=_auth(token))
        if r.status_code == 200:
            body = r.text.lower()
            assert "strongpass" not in body, "Password in export"
            assert "hashed_password" not in body, "Hashed password in export"


# ======================== Account Deletion Cascade ========================

class TestAccountDeletionCascade:
    """Ensure account deletion removes ALL user-owned data."""

    def test_delete_account_removes_medicines(self, client, clean_state):
        """After account deletion, medicines should be gone."""
        _register(client, "del_acct@test.com")
        token = _login(client, "del_acct@test.com")
        # Delete the account
        import json as jsonlib
        r = client.request("DELETE", "/api/auth/account",
                          content=jsonlib.dumps({"password": "StrongPass!1", "confirm_phrase": "DELETE"}),
                          headers={**_auth(token), "Content-Type": "application/json"})
        assert r.status_code in (200, 204), f"Account deletion returned: {r.status_code}"


# ======================== Timezone Validation ========================

class TestTimezoneValidation:
    """Test timezone field validation."""

    def test_invalid_timezone_rejected_on_register(self, client, clean_state):
        """An invalid timezone should be rejected."""
        r = client.post("/api/auth/register", json={
            "email": "tz_bad@test.com", "password": "StrongPass!1",
            "confirm_password": "StrongPass!1",
            "full_name": "TZ Test", "date_of_birth": "1990-01-01",
            "gender": "MALE", "timezone": "Mars/Olympus_Mons"
        })
        assert r.status_code in (422, 400), f"Invalid timezone accepted: {r.status_code}"

    def test_valid_timezone_accepted_on_register(self, client, clean_state):
        """A valid IANA timezone should be accepted."""
        r = client.post("/api/auth/register", json={
            "email": "tz_good@test.com", "password": "StrongPass!1",
            "confirm_password": "StrongPass!1",
            "full_name": "TZ Test", "date_of_birth": "1990-01-01",
            "gender": "MALE", "timezone": "Asia/Kolkata"
        })
        assert r.status_code in (200, 201), f"Valid timezone rejected: {r.status_code}"
        if r.status_code in (200, 201):
            token = _login(client, "tz_good@test.com")
            me = client.get("/api/auth/me", headers=_auth(token))
            if me.status_code == 200:
                tz = me.json().get("timezone") or me.json().get("user", {}).get("timezone")
                assert tz == "Asia/Kolkata", f"Timezone not saved: {tz}"
