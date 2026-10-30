import logging
import re
from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import text

from app.config.settings import settings
from app.models import User
from app.utils.security import decode_access_token
from tests.conftest import PASSWORD, login

REG = {
    "email": "New.User@Test.com", "password": PASSWORD, "confirm_password": PASSWORD,
    "full_name": "New User", "gender": "FEMALE", "date_of_birth": "1995-04-12",
}


def test_register_success_and_password_is_hashed(client, db):
    r = client.post("/api/auth/register", json=REG)
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "new.user@test.com"          # normalised to lowercase
    assert body["role"] == "USER"
    assert "password" not in body and "password_hash" not in body
    stored = db.query(User).filter_by(email="new.user@test.com").one()
    assert stored.password_hash.startswith("$2") and stored.password_hash != PASSWORD
    assert stored.profile is not None                       # empty profile created with the account


def test_register_duplicate_email_is_case_insensitive(client):
    assert client.post("/api/auth/register", json=REG).status_code == 201
    dup = {**REG, "email": "new.user@TEST.com"}
    assert client.post("/api/auth/register", json=dup).status_code == 409


def test_register_rejects_weak_and_mismatched_passwords(client):
    weak = client.post("/api/auth/register", json={**REG, "password": "password", "confirm_password": "password"})
    assert weak.status_code == 422
    mismatch = client.post("/api/auth/register", json={**REG, "confirm_password": "Different1!"})
    assert mismatch.status_code == 422
    assert "detail" in mismatch.json()  # validation errors must serialise cleanly (no 500)


def test_login_and_me(client, make_user):
    make_user(email="a@test.com")
    r = login(client, "a@test.com")
    assert r.status_code == 200
    data = r.json()
    assert data["token_type"] == "bearer" and data["user"]["email"] == "a@test.com"
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me.status_code == 200 and me.json()["email"] == "a@test.com"


def test_login_errors_do_not_reveal_which_part_was_wrong(client, make_user):
    make_user(email="a@test.com")
    wrong_pw = login(client, "a@test.com", "Wrong!Pass1")
    unknown = login(client, "nobody@test.com")
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json()["detail"] == unknown.json()["detail"]


def test_deactivated_user_cannot_login_and_existing_token_stops_working(client, make_user, db):
    u = make_user(email="a@test.com")
    token = login(client, "a@test.com").json()["access_token"]
    u.is_active = False
    db.commit()
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    assert login(client, "a@test.com").status_code == 403


def test_protected_routes_reject_missing_garbage_expired_and_forged_tokens(client, make_user):
    u = make_user(email="a@test.com")
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401
    now = datetime.now(timezone.utc)
    expired = jwt.encode({"sub": str(u.id), "type": "access", "exp": now - timedelta(minutes=1)},
                         settings.SECRET_KEY, algorithm="HS256")
    forged = jwt.encode({"sub": str(u.id), "type": "access", "exp": now + timedelta(hours=1)},
                        "some-other-key", algorithm="HS256")
    for bad in (expired, forged):
        assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {bad}"}).status_code == 401


def test_admin_claim_in_token_is_not_trusted(client, make_user):
    """Role is read from the DB; a user can't self-promote by minting a token (needs the secret anyway)."""
    u = make_user(email="a@test.com")
    tok = login(client, "a@test.com").json()["access_token"]
    assert decode_access_token(tok)["role"] == "USER"
    assert client.get("/api/admin/users", headers={"Authorization": f"Bearer {tok}"}).status_code == 403


def test_refresh_rotation_and_reuse_detection(client, make_user):
    make_user(email="a@test.com")
    first = login(client, "a@test.com").json()
    second = client.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert second.status_code == 200
    new_refresh = second.json()["refresh_token"]
    # Replaying the old (rotated) token is treated as theft: it fails AND revokes the new one too.
    assert client.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]}).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": new_refresh}).status_code == 401


def test_logout_revokes_refresh_token(client, make_user):
    make_user(email="a@test.com")
    tokens = login(client, "a@test.com").json()
    assert client.post("/api/auth/logout", json={"refresh_token": tokens["refresh_token"]}).status_code == 200
    assert client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401


def test_password_reset_flow(client, make_user, outbox, caplog):
    make_user(email="a@test.com")
    old_refresh = login(client, "a@test.com").json()["refresh_token"]

    with caplog.at_level(logging.INFO):
        known = client.post("/api/auth/forgot-password", json={"email": "a@test.com"})
        unknown = client.post("/api/auth/forgot-password", json={"email": "ghost@test.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()                      # no account enumeration

    sent = outbox()
    assert len(sent) >= 1, "Expected email in test outbox"
    m = re.search(r"token=([A-Za-z0-9_\-\.]+)", sent[-1].get("html_body", "") or sent[-1].get("text_body", ""))
    assert m, "Token not found in email body"
    token = m.group(1)

    # Security check: Assert token does NOT appear anywhere in server logs
    assert token not in caplog.text, "Security violation: token leaked into logs!"

    new_pw = "Brand!New9Pass"
    ok = client.post("/api/auth/reset-password", json={"token": token, "password": new_pw, "confirm_password": new_pw})
    assert ok.status_code == 200
    assert login(client, "a@test.com", PASSWORD).status_code == 401
    assert login(client, "a@test.com", new_pw).status_code == 200
    assert client.post("/api/auth/refresh", json={"refresh_token": old_refresh}).status_code == 401  # signed out everywhere
    reuse = client.post("/api/auth/reset-password", json={"token": token, "password": new_pw, "confirm_password": new_pw})
    assert reuse.status_code == 400                             # single use


def test_reset_password_rejects_bad_token_and_weak_password(client):
    r = client.post("/api/auth/reset-password",
                    json={"token": "nope", "password": "Brand!New9Pass", "confirm_password": "Brand!New9Pass"})
    assert r.status_code == 400
    weak = client.post("/api/auth/reset-password", json={"token": "x", "password": "weak", "confirm_password": "weak"})
    assert weak.status_code == 422


def test_email_verification_flow(client, outbox, caplog):
    with caplog.at_level(logging.INFO):
        client.post("/api/auth/register", json=REG)
    sent = outbox()
    assert len(sent) >= 1, "Expected welcome email in test outbox"
    m = re.search(r"token=([A-Za-z0-9_\-\.]+)", sent[-1].get("html_body", "") or sent[-1].get("text_body", ""))
    assert m, "Verification token not found in email body"
    token = m.group(1)

    # Security check: Assert verification token does NOT appear anywhere in server logs
    assert token not in caplog.text, "Security violation: email verification token leaked into logs!"

    assert client.post("/api/auth/verify-email", json={"token": token}).status_code == 200
    assert client.post("/api/auth/verify-email", json={"token": token}).status_code == 400


def test_login_is_rate_limited(client, make_user):
    make_user(email="a@test.com")
    codes = [login(client, "a@test.com", "Wrong!Pass1").status_code for _ in range(settings.LOGIN_RATE_LIMIT + 2)]
    assert codes[: settings.LOGIN_RATE_LIMIT] == [401] * settings.LOGIN_RATE_LIMIT
    assert codes[-1] == 429


def test_tokens_stored_hashed_not_raw(client, make_user, db):
    make_user(email="a@test.com")
    raw = login(client, "a@test.com").json()["refresh_token"]
    stored = [r[0] for r in db.execute(text("SELECT token_hash FROM user_tokens"))]
    assert raw not in stored and all(len(h) == 64 for h in stored)


def test_seeded_local_domain_accounts_can_log_in(client, make_user):
    """Regression: EmailStr rejects '.local', which locked out the spec's seed accounts."""
    make_user(email="admin@healthpredict.local", role="ADMIN")
    r = login(client, "  Admin@HealthPredict.local ")   # also trimmed + case-insensitive
    assert r.status_code == 200 and r.json()["user"]["email"] == "admin@healthpredict.local"
    tok = r.json()["access_token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 200
    assert client.get("/api/admin/users", headers={"Authorization": f"Bearer {tok}"}).status_code == 200
    assert client.post("/api/auth/forgot-password", json={"email": "admin@healthpredict.local"}).status_code == 200


def test_login_still_rejects_non_email_input(client):
    assert login(client, "not-an-email").status_code == 422
    assert login(client, "a b@c.com").status_code == 422


def test_registration_still_rejects_reserved_domains(client):
    r = client.post("/api/auth/register", json={**REG, "email": "someone@fake.local"})
    assert r.status_code == 422
