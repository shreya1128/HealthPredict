"""Group 6 Automated Integration Tests:
- A1: DELETE /api/auth/account (cascading wipe, requires DELETE confirm, leaves 0 user rows in DB)
- A2: GET /api/auth/account/export (JSON and ZIP export)
- A3: CSRF double-submit protection & HttpOnly cookie issuance
- A4: Security Center: sessions list & revoke, email change, password change, TOTP 2FA
- A5: Public link hardening: doctor notes append-only, 2000 char cap, hide/delete, emergency card token regenerate
"""

import io
import zipfile
import pytest
from sqlalchemy import text
from app.models import (
    User, CareProfile, Medicine, SymptomLog, DoctorShare, DoctorShareNote,
    EmergencyCard, UserToken
)
from app.utils.totp import generate_totp_code


def login(client, email="user@example.com", password="Password123!"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_csrf_protection_and_cookie_issuance(client, make_user):
    user = make_user(email="csrf_test@example.com", password="Password123!")
    
    # 1. Login sets cookies (access_token, refresh_token, csrf_token)
    res = login(client, "csrf_test@example.com", "Password123!")
    assert res.status_code == 200
    cookies = client.cookies
    assert "access_token" in cookies
    assert "csrf_token" in cookies
    csrf_val = cookies["csrf_token"]
    assert csrf_val is not None

    # 2. Mutating request with cookie auth but NO X-CSRF-Token header -> 403 Forbidden
    # Remove Authorization header if any was set by helpers
    headers = {"Content-Type": "application/json"}
    bad_req = client.post("/api/auth/sessions/revoke-all", headers=headers)
    assert bad_req.status_code == 403
    assert "CSRF validation failed" in bad_req.json()["detail"]

    # 3. Mutating request with matching X-CSRF-Token header -> 200 OK
    headers["X-CSRF-Token"] = csrf_val
    ok_req = client.post("/api/auth/sessions/revoke-all", headers=headers)
    assert ok_req.status_code == 200

    # 4. Bearer authentication bypasses CSRF check (e.g. mobile apps)
    token = res.json()["access_token"]
    bearer_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    bearer_req = client.post("/api/auth/sessions/revoke-all", headers=bearer_headers)
    assert bearer_req.status_code == 200


def test_totp_two_factor_workflow(client, make_user, db):
    user = make_user(email="totp_user@example.com", password="Password123!")
    login_res = login(client, "totp_user@example.com", "Password123!")
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Setup TOTP
    setup_res = client.post("/api/auth/totp/setup", headers=headers)
    assert setup_res.status_code == 200
    secret = setup_res.json()["secret"]
    assert len(secret) >= 16
    assert "otpauth://" in setup_res.json()["otpauth_url"]

    # 2. Enable TOTP with code
    valid_code = generate_totp_code(secret)
    enable_res = client.post(
        "/api/auth/totp/enable",
        json={"password": secret, "code": valid_code},
        headers=headers,
    )
    assert enable_res.status_code == 200

    # Verify user now has TOTP enabled in DB
    db.refresh(user)
    assert user.totp_enabled is True

    # 3. Next login returns totp_required=True and temp_token
    client.cookies.clear()
    login2 = client.post("/api/auth/login", json={"email": "totp_user@example.com", "password": "Password123!"})
    assert login2.status_code == 200
    assert login2.json()["totp_required"] is True
    temp_token = login2.json()["temp_token"]
    assert temp_token is not None

    # 4. Complete login with TOTP code
    totp_code = generate_totp_code(secret)
    verify_res = client.post(
        "/api/auth/login/totp",
        json={"temp_token": temp_token, "code": totp_code},
    )
    assert verify_res.status_code == 200
    assert "access_token" in verify_res.json()
    new_token = verify_res.json()["access_token"]

    # 5. Disable TOTP
    disable_code = generate_totp_code(secret)
    dis_res = client.post(
        "/api/auth/totp/disable",
        json={"password": "Password123!", "code": disable_code},
        headers={"Authorization": f"Bearer {new_token}"},
    )
    assert dis_res.status_code == 200
    
    # Query fresh from DB to verify committed change
    from app.config.database import SessionLocal
    with SessionLocal() as s:
        user_in_db = s.get(User, user.id)
        assert user_in_db.totp_enabled is False


def test_session_management_and_remote_revocation(client, make_user, db):
    user = make_user(email="session_user@example.com", password="Password123!")
    
    # Create two sessions
    sess1 = login(client, "session_user@example.com", "Password123!")
    token1 = sess1.json()["access_token"]
    refresh1 = sess1.json()["refresh_token"]

    sess2 = login(client, "session_user@example.com", "Password123!")
    token2 = sess2.json()["access_token"]
    refresh2 = sess2.json()["refresh_token"]

    headers = {"Authorization": f"Bearer {token2}"}
    list_res = client.get("/api/auth/sessions", headers=headers)
    assert list_res.status_code == 200
    sessions = list_res.json()
    assert len(sessions) >= 2

    # Find the session corresponding to refresh1
    from app.utils.security import hash_token
    h1 = hash_token(refresh1)
    # Get session 1 id from db or list
    sess1_obj = db.query(UserToken).filter(UserToken.token_hash == h1).first()
    assert sess1_obj is not None

    # Revoke first session
    rev_res = client.delete(f"/api/auth/sessions/{sess1_obj.id}", headers=headers)
    assert rev_res.status_code == 200

    # Using refresh1 should now fail
    ref_res = client.post("/api/auth/refresh", json={"refresh_token": refresh1})
    assert ref_res.status_code == 401


def test_change_password_and_email_flow(client, make_user, db, outbox):
    user = make_user(email="change_flow@example.com", password="Password123!")
    login_res = login(client, "change_flow@example.com", "Password123!")
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Change email request
    req_res = client.post(
        "/api/auth/change-email",
        json={"new_email": "new_address@example.com", "password": "Password123!"},
        headers=headers,
    )
    assert req_res.status_code == 200
    emails = outbox()
    assert len(emails) >= 1
    # Find token in email text or link
    raw_email_text = emails[-1].get("text_body") or emails[-1].get("html_body") or ""
    import re
    match = re.search(r"token=([a-zA-Z0-9_\-]+)", raw_email_text)
    assert match is not None
    verify_token = match.group(1)

    # 2. Confirm email change
    conf_res = client.post("/api/auth/confirm-email-change", json={"token": verify_token})
    assert conf_res.status_code == 200
    db.refresh(user)
    assert user.email == "new_address@example.com"

    # 3. Change password
    pw_res = client.post(
        "/api/auth/change-password",
        json={
            "current_password": "Password123!",
            "new_password": "NewSecretPassword123#",
            "confirm_new_password": "NewSecretPassword123#",
        },
        headers=headers,
    )
    assert pw_res.status_code == 200

    # Old password no longer works
    fail_login = client.post("/api/auth/login", json={"email": "new_address@example.com", "password": "Password123!"})
    assert fail_login.status_code == 401

    # New password works
    succ_login = client.post("/api/auth/login", json={"email": "new_address@example.com", "password": "NewSecretPassword123#"})
    assert succ_login.status_code == 200


def test_data_export_json_and_zip(client, make_user, db):
    user = make_user(email="export_user@example.com", password="Password123!")
    from datetime import date
    med = Medicine(
        user_id=user.id,
        medicine_name="Metformin",
        dosage=500,
        dosage_unit="mg",
        frequency=1,
        frequency_unit="DAILY",
        start_date=date.today(),
    )
    db.add(med)
    db.commit()

    tok = login(client, "export_user@example.com", "Password123!").json()["access_token"]
    headers = {"Authorization": f"Bearer {tok}"}

    # 1. JSON Export
    json_res = client.get("/api/auth/account/export?format=json", headers=headers)
    assert json_res.status_code == 200
    data = json_res.json()
    assert data["user"]["email"] == "export_user@example.com"
    assert len(data["medicines"]) >= 1
    assert data["medicines"][0]["name"] == "Metformin"

    # 2. ZIP Export
    zip_res = client.get("/api/auth/account/export?format=zip", headers=headers)
    assert zip_res.status_code == 200
    assert zip_res.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(zip_res.content), "r") as zf:
        file_list = zf.namelist()
        assert "profile.csv" in file_list
        assert "medicines.csv" in file_list
        med_csv = zf.read("medicines.csv").decode("utf-8")
        assert "Metformin" in med_csv


def test_doctor_notes_append_only_and_caps(client, make_user, db):
    doctor = make_user(email="patient_doc@example.com", password="Password123!")
    patient_tok = login(client, "patient_doc@example.com", "Password123!").json()["access_token"]
    headers = {"Authorization": f"Bearer {patient_tok}"}

    # Generate doctor share link
    share_res = client.post("/api/reports/doctor-summary/share?expire_days=7", headers=headers)
    assert share_res.status_code == 200
    share_token = share_res.json()["token"]

    # Public doctor view
    public_view = client.get(f"/api/reports/doctor-summary/public/{share_token}")
    assert public_view.status_code == 200

    # Add note with 2000 char cap
    note_text = "Patient is doing great, blood pressure is stable. Keep current dosage."
    note_res = client.post(
        f"/api/reports/doctor-summary/public/{share_token}/notes",
        json={"doctor_name": "Dr. Sarah Smith", "doctor_notes": note_text},
    )
    assert note_res.status_code == 200
    note_id = note_res.json()["note_id"]
    assert note_res.json()["verification_status"] == "External note (unverified)"

    # Reject note > 2000 chars
    long_note = "A" * 2005
    bad_note = client.post(
        f"/api/reports/doctor-summary/public/{share_token}/notes",
        json={"doctor_name": "Dr. Smith", "doctor_notes": long_note},
    )
    assert bad_note.status_code == 400

    # Patient can hide note
    hide_res = client.patch(f"/api/reports/doctor-summary/notes/{note_id}/hide", headers=headers)
    assert hide_res.status_code == 200

    # Patient can delete note
    del_res = client.delete(f"/api/reports/doctor-summary/notes/{note_id}", headers=headers)
    assert del_res.status_code == 200


def test_emergency_card_hardening(client, make_user, db):
    user = make_user(email="emg_card@example.com", password="Password123!")
    tok = login(client, "emg_card@example.com", "Password123!").json()["access_token"]
    headers = {"Authorization": f"Bearer {tok}"}

    card_res = client.get("/api/health/emergency-card", headers=headers)
    assert card_res.status_code == 200
    # Cards are private by default
    assert card_res.json()["is_public"] is False
    old_token = card_res.json()["public_token"]

    # Public access to a private card should return 404
    assert client.get(f"/api/health/emergency-card/public/{old_token}").status_code == 404

    # Toggle visibility to public (explicit opt-in with consent)
    pub_res = client.patch("/api/health/emergency-card/visibility?is_public=true&consent_acknowledged=true", headers=headers)
    assert pub_res.status_code == 200
    assert pub_res.json()["is_public"] is True

    # Public access to public card returns 200
    assert client.get(f"/api/health/emergency-card/public/{old_token}").status_code == 200

    # Regenerate link
    regen_res = client.post("/api/health/emergency-card/regenerate-link", headers=headers)
    assert regen_res.status_code == 200
    new_token = regen_res.json()["public_token"]
    assert new_token != old_token

    # Public access to old token is 404
    assert client.get(f"/api/health/emergency-card/public/{old_token}").status_code == 404
    # Public access to new token is 200 (card is still public)
    assert client.get(f"/api/health/emergency-card/public/{new_token}").status_code == 200

    # Toggle visibility to private
    priv_res = client.patch("/api/health/emergency-card/visibility?is_public=false", headers=headers)
    assert priv_res.status_code == 200
    assert priv_res.json()["is_public"] is False
    # Public access is now 404
    assert client.get(f"/api/health/emergency-card/public/{new_token}").status_code == 404


def test_account_deletion_cascades_and_cleans_all_tables(client, make_user, db):
    """A1: DELETE /api/auth/account requiring password & 'DELETE' phrase.
    Asserts zero remaining rows across all tables for that user.
    """
    user = make_user(email="wipe_me@example.com", password="Password123!")
    uid = user.id
    from datetime import date

    # Populate several related rows
    med = Medicine(
        user_id=uid,
        medicine_name="Aspirin",
        dosage=100,
        dosage_unit="mg",
        frequency=1,
        frequency_unit="DAILY",
        start_date=date.today(),
    )
    sym = SymptomLog(user_id=uid, symptom_name="Headache", severity=3)
    card = EmergencyCard(user_id=uid, public_token="test_wipe_token", blood_type="O+", is_public=True)
    db.add_all([med, sym, card])
    db.commit()

    tok = login(client, "wipe_me@example.com", "Password123!").json()["access_token"]
    headers = {"Authorization": f"Bearer {tok}"}

    # Wrong confirmation phrase -> 422
    bad_confirm = client.request(
        "DELETE",
        "/api/auth/account",
        json={"password": "Password123!", "confirm_phrase": "NOT_DELETE"},
        headers=headers,
    )
    assert bad_confirm.status_code == 422

    # Correct deletion
    del_res = client.request(
        "DELETE",
        "/api/auth/account",
        json={"password": "Password123!", "confirm_phrase": "DELETE"},
        headers=headers,
    )
    assert del_res.status_code == 200

    # Assert 0 rows in user-scoped tables for this user_id
    from app.config.database import SessionLocal
    with SessionLocal() as s:
        assert s.get(User, uid) is None
        tables_to_check = [
            ("users", "id"),
            ("user_profiles", "user_id"),
            ("care_profiles", "account_owner_id"),
            ("medicines", "user_id"),
            ("symptom_logs", "user_id"),
            ("emergency_cards", "user_id"),
            ("doctor_shares", "user_id"),
            ("user_tokens", "user_id"),
            ("notifications", "user_id"),
        ]
        for tbl, id_col in tables_to_check:
            cnt = s.execute(text(f"SELECT COUNT(*) FROM {tbl} WHERE {id_col} = :uid"), {"uid": uid}).scalar()
            assert cnt == 0, f"Expected 0 rows in {tbl} for user {uid}, found {cnt}"
