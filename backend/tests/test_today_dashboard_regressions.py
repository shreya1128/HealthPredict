from datetime import date
import pytest

from app.models import CareProfile, CaregiverAccess, CaregiverAccessLevel, CaregiverInviteStatus, Medicine, HealthAssessment


def test_today_dashboard_primary_and_zero_data(client, auth_headers):
    """Zero-data state should return 200 with clean defaults and zero 500s."""
    h = auth_headers("zero_user@example.com")
    resp = client.get("/api/dashboard", headers=h)
    assert resp.status_code == 200
    data = resp.json()
    assert data["latest_assessment"] is None
    assert data["today_medicines"] == []
    assert data["hydration_today"]["total_ml"] == 0
    assert data["exercise_this_week"]["total_minutes"] == 0
    assert data["active_goals"] == []
    assert data["insights"] == []


def test_today_dashboard_family_profile_isolation(client, auth_headers, db):
    """Data logged under a family member profile must be isolated from the primary user's dashboard."""
    h = auth_headers("family_head@example.com")

    # Create family member profile under /api/care-profiles
    prof_resp = client.post("/api/care-profiles", headers=h, json={
        "full_name": "Little Tommy",
        "relationship": "CHILD"
    })
    assert prof_resp.status_code == 201
    family_profile_id = prof_resp.json()["id"]

    # Log exercise under primary user (no profile header)
    client.post("/api/exercise", headers=h, json={"exercise_type": "Jogging", "duration_minutes": 45})

    # Log exercise under family member profile
    h_child = {**h, "X-Profile-ID": str(family_profile_id)}
    client.post("/api/exercise", headers=h_child, json={"exercise_type": "Swimming", "duration_minutes": 60})

    # Primary user's dashboard should show 45 minutes
    resp_primary = client.get("/api/dashboard", headers=h)
    assert resp_primary.status_code == 200
    assert resp_primary.json()["exercise_this_week"]["total_minutes"] == 45

    # Child's dashboard should show 60 minutes
    resp_child = client.get("/api/dashboard", headers=h_child)
    assert resp_child.status_code == 200
    assert resp_child.json()["exercise_this_week"]["total_minutes"] == 60


def test_today_dashboard_caregiver_access(client, auth_headers, db):
    """A caregiver with active accepted access can view a patient's managed family profile dashboard."""
    patient_headers = auth_headers("patient@example.com")
    caregiver_headers = auth_headers("caregiver@example.com")

    # Patient creates a dependent profile (e.g. Grandma)
    prof_resp = client.post("/api/care-profiles", headers=patient_headers, json={
        "full_name": "Grandma Rose",
        "relationship": "PARENT"
    })
    assert prof_resp.status_code == 201
    parent_profile_id = prof_resp.json()["id"]

    # Patient logs exercise under Grandma Rose
    h_grandma = {**patient_headers, "X-Profile-ID": str(parent_profile_id)}
    client.post("/api/exercise", headers=h_grandma, json={"exercise_type": "Walking", "duration_minutes": 35})

    # Patient invites caregiver
    invite_resp = client.post("/api/care-profiles/caregivers/invite", headers=patient_headers, json={
        "caregiver_email": "caregiver@example.com",
        "access_level": "VIEW_ONLY"
    })
    assert invite_resp.status_code == 201
    invite_data = invite_resp.json()
    assert invite_data["email_delivered"] in (True, False)
    assert "email_delivery_status" in invite_data

    # Query DB to get token
    cg = db.get(CaregiverAccess, invite_data["id"])
    token = cg.invite_token

    # Caregiver accepts invite
    accept_resp = client.post("/api/care-profiles/caregivers/accept", headers=caregiver_headers, json={"token": token})
    assert accept_resp.status_code == 200

    # Caregiver views Grandma Rose's dashboard using X-Profile-ID
    h_caregiver_grandma = {**caregiver_headers, "X-Profile-ID": str(parent_profile_id)}
    cg_dash_resp = client.get("/api/dashboard", headers=h_caregiver_grandma)
    assert cg_dash_resp.status_code == 200
    assert cg_dash_resp.json()["exercise_this_week"]["total_minutes"] == 35

    # Caregiver's own dashboard is still isolated (0 minutes)
    cg_own_resp = client.get("/api/dashboard", headers=caregiver_headers)
    assert cg_own_resp.status_code == 200
    assert cg_own_resp.json()["exercise_this_week"]["total_minutes"] == 0
