from datetime import date
import pytest
from app.models.care_profile import CareProfile, CaregiverAccess, CaregiverAccessLevel, CaregiverInviteStatus, RelationshipType
from app.models.medicine import Medicine
from app.models.health import HealthAssessment
from app.models.emergency_and_symptoms import SymptomLog, EmergencyCard
from app.models.tracking import ExerciseLog, WellnessGoal


def test_primary_profile_auto_created(client, auth_headers):
    """When a user accesses care profiles, their primary profile exists with SELF relationship."""
    h = auth_headers("alice@example.com")
    r = client.get("/api/care-profiles", headers=h)
    assert r.status_code == 200
    profiles = r.json()
    assert len(profiles) >= 1
    primary = next((p for p in profiles if p["is_primary"]), None)
    assert primary is not None
    assert primary["relationship"] == "SELF"


def test_cross_account_isolation_returns_404(client, auth_headers):
    """Accessing another user's profile ID directly returns 404 (same as missing)."""
    h_a = auth_headers("user_a@example.com")
    h_b = auth_headers("user_b@example.com")

    # User A creates a profile for Child
    r_create = client.post("/api/care-profiles", headers=h_a, json={
        "full_name": "Child A",
        "relationship": "CHILD",
        "date_of_birth": "2018-05-10",
        "gender": "MALE",
    })
    assert r_create.status_code == 201
    child_id = r_create.json()["id"]

    # User B tries to view medicines or symptoms or dashboard using Child A's profile id
    headers_b_scoped = {**h_b, "X-Profile-Id": str(child_id)}
    assert client.get("/api/medicines", headers=headers_b_scoped).status_code == 404
    assert client.get("/api/dashboard", headers=headers_b_scoped).status_code == 404
    assert client.get("/api/emergency/card", headers=headers_b_scoped).status_code == 404


def test_profile_isolation_within_account(client, auth_headers):
    """Profiles within the same account do not leak medicines, symptoms, or tracking data."""
    h = auth_headers("parent@example.com")

    # Primary profile
    r_profiles = client.get("/api/care-profiles", headers=h).json()
    primary_id = next(p["id"] for p in r_profiles if p["is_primary"])

    # Create child profile
    r_child = client.post("/api/care-profiles", headers=h, json={
        "full_name": "Child Bob",
        "relationship": "CHILD",
        "date_of_birth": "2015-01-01",
        "gender": "MALE",
    }).json()
    child_id = r_child["id"]

    # Add medicine to child
    h_child = {**h, "X-Profile-Id": str(child_id)}
    r_med = client.post("/api/medicines", headers=h_child, json={
        "medicine_name": "Children Amoxicillin",
        "dosage": 250,
        "dosage_unit": "mg",
        "start_date": str(date.today()),
        "frequency_unit": "DAILY",
        "time_of_day": ["08:00", "20:00"],
        "instructions": "With food",
    })
    assert r_med.status_code == 201

    # Primary profile medicines must NOT list child's medicine
    h_primary = {**h, "X-Profile-Id": str(primary_id)}
    meds_primary = client.get("/api/medicines", headers=h_primary).json()
    assert not any(m["medicine_name"] == "Children Amoxicillin" for m in meds_primary)

    # Child profile medicines MUST list it
    meds_child = client.get("/api/medicines", headers=h_child).json()
    assert any(m["medicine_name"] == "Children Amoxicillin" for m in meds_child)


def test_caregiver_permissions_view_only_vs_edit(client, auth_headers, db):
    """VIEW_ONLY caregiver gets 200 on GET, 403 on mutating routes; EDIT gets 200/201 on both."""
    h_owner = auth_headers("care_owner@example.com")
    h_viewer = auth_headers("care_viewer@example.com")
    h_editor = auth_headers("care_editor@example.com")

    # Owner's primary profile
    profiles = client.get("/api/care-profiles", headers=h_owner).json()
    owner_primary_id = profiles[0]["id"]

    # Create a non-primary family member profile for caregiver access testing
    # (Caregivers cannot access the owner's primary profile — that's the security fix)
    r_family = client.post("/api/care-profiles", headers=h_owner, json={
        "full_name": "Mom",
        "relationship": "PARENT",
        "gender": "FEMALE",
    })
    assert r_family.status_code == 201
    family_profile_id = r_family.json()["id"]

    # 1. Invite viewer as VIEW_ONLY
    r_inv_view = client.post("/api/care-profiles/caregivers/invite", headers=h_owner, json={
        "caregiver_name": "Viewer Friend",
        "caregiver_email": "care_viewer@example.com",
        "access_level": "VIEW_ONLY",
    })
    assert r_inv_view.status_code == 201
    assert "token" not in r_inv_view.json()  # S7 rule: never return invite token in API response

    # Fetch token directly from db for testing accept flow
    inv_view_record = db.scalar(
        __import__("sqlalchemy").select(CaregiverAccess).where(
            CaregiverAccess.caregiver_email == "care_viewer@example.com"
        )
    )
    token_view = inv_view_record.invite_token

    # Viewer accepts
    r_acc = client.post("/api/care-profiles/caregivers/accept", headers=h_viewer, json={"token": token_view})
    assert r_acc.status_code == 200

    # Viewer reads owner's family member profile: allowed (200)
    h_viewer_scoped = {**h_viewer, "X-Profile-Id": str(family_profile_id)}
    assert client.get("/api/medicines", headers=h_viewer_scoped).status_code == 200
    assert client.get("/api/dashboard", headers=h_viewer_scoped).status_code == 200

    # Viewer tries to access owner's PRIMARY profile: blocked (404) — security boundary
    h_viewer_primary = {**h_viewer, "X-Profile-Id": str(owner_primary_id)}
    assert client.get("/api/medicines", headers=h_viewer_primary).status_code == 404

    # Viewer mutates owner profile: forbidden (403)
    r_mutate = client.post("/api/medicines", headers=h_viewer_scoped, json={
        "medicine_name": "Unauthorized Aspirin",
        "dosage": 100,
        "dosage_unit": "mg",
        "start_date": str(date.today()),
        "frequency_unit": "DAILY",
        "time_of_day": ["08:00"],
    })
    assert r_mutate.status_code == 403
    assert "view-only access" in r_mutate.json()["detail"].lower()

    # 2. Invite editor as EDIT
    r_inv_edit = client.post("/api/care-profiles/caregivers/invite", headers=h_owner, json={
        "caregiver_name": "Editor Nurse",
        "caregiver_email": "care_editor@example.com",
        "access_level": "EDIT",
    })
    assert r_inv_edit.status_code == 201
    db.commit()
    db.expire_all()
    inv_edit_record = db.scalar(
        __import__("sqlalchemy").select(CaregiverAccess).where(
            CaregiverAccess.caregiver_email == "care_editor@example.com"
        )
    )
    token_edit = inv_edit_record.invite_token

    # Editor accepts
    r_acc_ed = client.post("/api/care-profiles/caregivers/accept", headers=h_editor, json={"token": token_edit})
    assert r_acc_ed.status_code == 200

    # Editor mutates owner profile: allowed (201) on family profile
    h_editor_scoped = {**h_editor, "X-Profile-Id": str(family_profile_id)}
    r_create_med = client.post("/api/medicines", headers=h_editor_scoped, json={
        "medicine_name": "Nurse Prescribed Med",
        "dosage": 500,
        "dosage_unit": "mg",
        "start_date": str(date.today()),
        "frequency_unit": "DAILY",
        "time_of_day": ["08:00"],
    })
    assert r_create_med.status_code == 201

    # Editor mutates owner PRIMARY profile: blocked (404) — security boundary
    h_editor_primary = {**h_editor, "X-Profile-Id": str(owner_primary_id)}
    assert client.post("/api/medicines", headers=h_editor_primary, json={
        "medicine_name": "Nurse Prescribed Med Primary",
        "dosage": 500,
        "dosage_unit": "mg",
        "start_date": str(date.today()),
        "frequency_unit": "DAILY",
        "time_of_day": ["08:00"],
    }).status_code == 404


def test_caregiver_pending_or_revoked_returns_404(client, auth_headers, db):
    """Pending or revoked caregiver access returns 404 (same as uninvited)."""
    h_owner = auth_headers("pending_owner@example.com")
    h_guest = auth_headers("guest@example.com")

    profiles = client.get("/api/care-profiles", headers=h_owner).json()
    owner_primary_id = profiles[0]["id"]

    # Invite but do NOT accept (status = PENDING)
    r_inv = client.post("/api/care-profiles/caregivers/invite", headers=h_owner, json={
        "caregiver_name": "Guest",
        "caregiver_email": "guest@example.com",
        "access_level": "VIEW_ONLY",
    })
    invite_id = r_inv.json()["id"]

    h_guest_scoped = {**h_guest, "X-Profile-Id": str(owner_primary_id)}
    # Pending grant must return 404
    assert client.get("/api/medicines", headers=h_guest_scoped).status_code == 404

    # Revoke invite
    client.delete(f"/api/care-profiles/caregivers/invite/{invite_id}", headers=h_owner)
    # Revoked grant must return 404
    assert client.get("/api/medicines", headers=h_guest_scoped).status_code == 404


def test_family_member_ai_prediction_safety_rule(client, auth_headers):
    """Safety rule: AI risk estimate uses only primary user stored demographics.
    Family member profiles return no estimate with a clear reason, while vitals check still works.
    """
    h = auth_headers("mother@example.com")
    # Mother adds child
    child = client.post("/api/care-profiles", headers=h, json={
        "full_name": "Toddler Tim",
        "relationship": "CHILD",
        "date_of_birth": "2023-01-01",
        "gender": "MALE",
    }).json()
    child_id = child["id"]

    # Log assessment for child
    h_child = {**h, "X-Profile-Id": str(child_id)}
    assessment_payload = {
        "systolic_bp": 105,
        "diastolic_bp": 68,
        "heart_rate_bpm": 85,
        "blood_glucose_mg_dl": 90,
        "spo2_percent": 99.0,
    }
    r = client.post("/api/health/assessment", headers=h_child, json=assessment_payload)
    assert r.status_code == 201
    data = r.json()

    # Vitals check still works
    assert data["risk_category"] in ("LOW", "MODERATE", "HIGH", "CRITICAL", "UNKNOWN")
    # But ML prediction is NOT estimated
    assert data["ml_prediction"] is None
    assert data["ml_prediction_notice"] is not None
    assert "account holder" in data["ml_prediction_notice"].lower() or "primary" in data["ml_prediction_notice"].lower()


def test_family_member_fhir_export_excludes_owner_telecom(client, auth_headers):
    """Safety rule: Family member FHIR export must not contain the account owner's email or phone."""
    h = auth_headers("owner_telecom@example.com")
    # Setup owner phone in profile
    client.put("/api/profile", headers=h, json={"phone": "+15551234567"})

    child = client.post("/api/care-profiles", headers=h, json={
        "full_name": "Little Jane",
        "relationship": "CHILD",
        "date_of_birth": "2019-06-15",
        "gender": "FEMALE",
    }).json()
    child_id = child["id"]

    # Export FHIR for primary profile: includes telecom
    fhir_primary = client.get("/api/reports/fhir", headers=h).json()
    patient_primary = next(e["resource"] for e in fhir_primary["entry"] if e["resource"]["resourceType"] == "Patient")
    assert any(t["value"] == "owner_telecom@example.com" for t in patient_primary.get("telecom", []))

    # Export FHIR for child profile: must NOT contain owner's email or phone
    h_child = {**h, "X-Profile-Id": str(child_id)}
    fhir_child = client.get("/api/reports/fhir", headers=h_child).json()
    patient_child = next(e["resource"] for e in fhir_child["entry"] if e["resource"]["resourceType"] == "Patient")
    assert patient_child["name"][0]["text"] == "Little Jane"
    assert len(patient_child.get("telecom", [])) == 0


def test_cascade_delete_profile(client, auth_headers, db):
    """Deleting a managed profile cascades to all its scoped records."""
    h = auth_headers("cascade_user@example.com")
    profile = client.post("/api/care-profiles", headers=h, json={
        "full_name": "Temporary Profile",
        "relationship": "OTHER",
        "gender": "OTHER",
    }).json()
    pid = profile["id"]

    h_scoped = {**h, "X-Profile-Id": str(pid)}
    # Add medicine and exercise log to this profile
    r_med = client.post("/api/medicines", headers=h_scoped, json={
        "medicine_name": "Temp Med",
        "dosage": 10,
        "dosage_unit": "mg",
        "start_date": str(date.today()),
        "frequency_unit": "DAILY",
        "time_of_day": ["08:00"],
    })
    assert r_med.status_code == 201

    r_ex = client.post("/api/exercise", headers=h_scoped, json={
        "exercise_date": str(date.today()),
        "exercise_type": "WALK",
        "duration_minutes": 30,
    })
    assert r_ex.status_code == 201

    # Delete profile
    r_del = client.delete(f"/api/care-profiles/{pid}", headers=h)
    assert r_del.status_code == 204

    # Verify database records are cascade deleted
    db.expire_all()
    assert db.query(CareProfile).filter_by(id=pid).first() is None
    assert db.query(Medicine).filter_by(care_profile_id=pid).first() is None
    assert db.query(ExerciseLog).filter_by(care_profile_id=pid).first() is None
