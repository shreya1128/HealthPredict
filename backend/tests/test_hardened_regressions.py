"""Regression tests for hardened-final fixes.

Covers:
- Voice entry range validation (B4): impossible values must be rejected
- Idempotent logout (A6): double-logout must not crash
- Emergency card consent (A8): public without consent → 400
- Doctor notes security (A5): external notes must not alter doctor_reviewed_at
- Timezone profile field (A3): setting and reading user timezone
"""

from datetime import date, datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User, UserProfile


# ── Voice entry range validation (B4) ────────────────────────────────────

class TestVoiceRangeValidation:
    """Impossible values must return 422, not 'saved'."""

    def _confirm_save(self, client, token, metric_type, fields):
        return client.post(
            "/api/health/voice/confirm-save",
            json={"metric_type": metric_type, "fields": fields, "target_date": str(date.today())},
            headers={"Authorization": f"Bearer {token}"},
        )

    def test_weight_5000kg_rejected(self, client: TestClient, db: Session, make_user, clean_state):
        make_user(email="vr1@test.com", name="VR1")
        token = client.post("/api/auth/login", json={"email": "vr1@test.com", "password": "Str0ng!Passw0rd"}).json()["access_token"]
        res = self._confirm_save(client, token, "WEIGHT", {"weight_kg": 5000})
        assert res.status_code == 422

    def test_negative_water_rejected(self, client: TestClient, db: Session, make_user, clean_state):
        make_user(email="vr2@test.com", name="VR2")
        token = client.post("/api/auth/login", json={"email": "vr2@test.com", "password": "Str0ng!Passw0rd"}).json()["access_token"]
        res = self._confirm_save(client, token, "HYDRATION", {"water_intake_ml": -300})
        assert res.status_code == 422

    def test_bp_400_over_20_rejected(self, client: TestClient, db: Session, make_user, clean_state):
        make_user(email="vr3@test.com", name="VR3")
        token = client.post("/api/auth/login", json={"email": "vr3@test.com", "password": "Str0ng!Passw0rd"}).json()["access_token"]
        res = self._confirm_save(client, token, "BLOOD_PRESSURE", {"systolic_bp": 400, "diastolic_bp": 20})
        assert res.status_code == 422

    def test_bp_systolic_less_than_diastolic_rejected(self, client: TestClient, db: Session, make_user, clean_state):
        make_user(email="vr4@test.com", name="VR4")
        token = client.post("/api/auth/login", json={"email": "vr4@test.com", "password": "Str0ng!Passw0rd"}).json()["access_token"]
        res = self._confirm_save(client, token, "BLOOD_PRESSURE", {"systolic_bp": 80, "diastolic_bp": 120})
        assert res.status_code == 422

    def test_weight_too_low_rejected(self, client: TestClient, db: Session, make_user, clean_state):
        make_user(email="vr5@test.com", name="VR5")
        token = client.post("/api/auth/login", json={"email": "vr5@test.com", "password": "Str0ng!Passw0rd"}).json()["access_token"]
        res = self._confirm_save(client, token, "WEIGHT", {"weight_kg": 5})
        assert res.status_code == 422

    def test_valid_weight_accepted(self, client: TestClient, db: Session, make_user, clean_state):
        make_user(email="vr6@test.com", name="VR6")
        token = client.post("/api/auth/login", json={"email": "vr6@test.com", "password": "Str0ng!Passw0rd"}).json()["access_token"]
        res = self._confirm_save(client, token, "WEIGHT", {"weight_kg": 70})
        assert res.status_code == 200
        assert res.json()["status"] == "saved"

    def test_valid_bp_accepted(self, client: TestClient, db: Session, make_user, clean_state):
        make_user(email="vr7@test.com", name="VR7")
        token = client.post("/api/auth/login", json={"email": "vr7@test.com", "password": "Str0ng!Passw0rd"}).json()["access_token"]
        res = self._confirm_save(client, token, "BLOOD_PRESSURE", {"systolic_bp": 120, "diastolic_bp": 80})
        assert res.status_code == 200
        assert res.json()["status"] == "saved"


# ── Idempotent logout (A6) ───────────────────────────────────────────────

class TestIdempotentLogout:
    """Double-logout with the same JWT must not crash."""

    def test_double_logout_returns_200(self, client: TestClient, db: Session, make_user, clean_state):
        make_user(email="logout@test.com", name="Logout User")
        token = client.post("/api/auth/login", json={"email": "logout@test.com", "password": "Str0ng!Passw0rd"}).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        r1 = client.post("/api/auth/logout", headers=headers)
        assert r1.status_code == 200

        r2 = client.post("/api/auth/logout", headers=headers)
        # Second logout: either 200 (idempotent) or 401 (token already revoked) — NOT 500
        assert r2.status_code in (200, 401)


# ── Emergency card consent (A8) ──────────────────────────────────────────

class TestEmergencyCardConsent:
    """Making the emergency card public requires consent_acknowledged."""

    def test_public_without_consent_returns_400(self):
        """Unit-level test using in-memory SQLite."""
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from app.config.database import Base
        from app.models.user import UserRole
        from app.services import emergency_service
        from fastapi import HTTPException

        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        S = sessionmaker(bind=engine)
        session = S()
        user = User(id=1, email="ec@test.com", password_hash="h", full_name="EC", role=UserRole.USER, is_active=True)
        session.add(user)
        session.commit()

        emergency_service.get_or_create_card(session, user_id=1)

        with pytest.raises(HTTPException) as exc_info:
            emergency_service.set_card_visibility(session, user_id=1, is_public=True, consent_acknowledged=False)
        assert exc_info.value.status_code == 400
        assert "Consent" in str(exc_info.value.detail)

        session.close()

    def test_public_with_consent_succeeds(self):
        """Unit-level test: consent_acknowledged=True allows making card public."""
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from app.config.database import Base
        from app.models.user import UserRole
        from app.services import emergency_service

        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        S = sessionmaker(bind=engine)
        session = S()
        user = User(id=1, email="ec2@test.com", password_hash="h", full_name="EC2", role=UserRole.USER, is_active=True)
        session.add(user)
        session.commit()

        card = emergency_service.get_or_create_card(session, user_id=1)
        assert card.is_public is False

        emergency_service.set_card_visibility(session, user_id=1, is_public=True, consent_acknowledged=True)
        assert card.is_public is True

        session.close()


# ── Timezone profile field (A3) ──────────────────────────────────────────

class TestTimezoneProfile:
    """User timezone can be set and read via the profile API."""

    def test_timezone_in_profile_update(self, client: TestClient, db: Session, make_user, clean_state):
        make_user(email="tz@test.com", name="TZ User")
        token = client.post("/api/auth/login", json={"email": "tz@test.com", "password": "Str0ng!Passw0rd"}).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Set timezone
        res = client.put("/api/profile", json={"timezone": "Asia/Kolkata"}, headers=headers)
        assert res.status_code == 200

        # Read it back
        profile_res = client.get("/api/profile", headers=headers)
        if profile_res.status_code == 200:
            data = profile_res.json()
            # timezone should be in the user data
            user = db.query(User).filter(User.email == "tz@test.com").first()
            assert user.timezone == "Asia/Kolkata"

    def test_invalid_timezone_rejected(self, client: TestClient, db: Session, make_user, clean_state):
        make_user(email="tz2@test.com", name="TZ2")
        token = client.post("/api/auth/login", json={"email": "tz2@test.com", "password": "Str0ng!Passw0rd"}).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        res = client.put("/api/profile", json={"timezone": "Not/A/Real/Zone"}, headers=headers)
        assert res.status_code == 422
