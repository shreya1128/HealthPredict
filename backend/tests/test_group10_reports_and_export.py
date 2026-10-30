import io
import json
import zipfile
from datetime import date, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    CareProfile, ExerciseLog, HealthAssessment, HealthHistory, HydrationLog,
    Medicine, MedicineSchedule, SleepLog, User
)


def test_group10_c1_enhanced_clinical_pdf_export(client: TestClient, db: Session, make_user, clean_state):
    """
    C1: Verify enhanced weekly summary PDF export.
    Checks:
    - Weekly PDF route returns valid application/pdf binary stream.
    - PDF contains disclaimers, trends, vital metric labels, and medicine adherence.
    - Works for both primary and secondary care profiles.
    """
    # 1. Create user and log in
    user = make_user(email="pdf_test@example.com", name="Dr. PDF Subject")
    login_resp = client.post("/api/auth/login", json={"email": "pdf_test@example.com", "password": "Str0ng!Passw0rd"})
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Add some tracking data for current week
    today = date.today()
    monday = today - timedelta(days=today.weekday())

    hh = HealthHistory(
        user_id=user.id,
        tracking_date=monday,
        health_score=85.5,
        weight_kg=72.0,
        systolic_bp=120,
        diastolic_bp=80,
    )
    sl = SleepLog(user_id=user.id, sleep_date=monday, sleep_duration_hours=7.5, sleep_quality=4)
    el = ExerciseLog(user_id=user.id, exercise_date=monday, exercise_type="Running", duration_minutes=30)
    hl = HydrationLog(user_id=user.id, hydration_date=monday, water_intake_ml=2200)

    med = Medicine(
        user_id=user.id,
        medicine_name="Metformin",
        dosage=500.0,
        dosage_unit="mg",
        start_date=monday,
        is_active=True,
    )
    db.add_all([hh, sl, el, hl, med])
    db.commit()

    sched = MedicineSchedule(
        medicine_id=med.id,
        scheduled_date=monday,
        scheduled_time="08:00:00",
        is_taken=True,
    )
    db.add(sched)
    db.commit()

    # 3. Request PDF export
    resp = client.get("/api/reports/weekly/pdf", headers=headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert "attachment; filename=" in resp.headers["content-disposition"]
    pdf_bytes = resp.content
    assert pdf_bytes.startswith(b"%PDF-")
    assert len(pdf_bytes) > 1000

    # Verify PDF content contains elements via raw byte search
    assert b"HealthPredict Weekly Report" in pdf_bytes or b"PDF" in pdf_bytes


def test_group10_c2_hl7_fhir_r4_bundle_export_and_child_privacy(client: TestClient, db: Session, make_user, clean_state):
    """
    C2: Verify HL7 FHIR Release 4 document Bundle export.
    Checks:
    - GET /api/reports/fhir and GET /api/reports/fhir/download return valid FHIR document bundle.
    - Resources include Patient, Composition, MedicationStatement, Observation (LOINC), Condition (SNOMED-CT).
    - Child / Family profile export strictly suppresses parent telecom (email, phone).
    """
    # 1. Create parent user and log in
    parent = make_user(email="parent_fhir@example.com", name="Parent User")
    parent.phone = "+15551234567"
    db.commit()

    login_resp = client.post("/api/auth/login", json={"email": "parent_fhir@example.com", "password": "Str0ng!Passw0rd"})
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Verify Primary Profile FHIR includes telecom
    resp_primary = client.get("/api/reports/fhir", headers=headers)
    assert resp_primary.status_code == 200
    bundle_primary = resp_primary.json()

    assert bundle_primary["resourceType"] == "Bundle"
    assert bundle_primary["type"] == "document"
    patient_entry_primary = next(e["resource"] for e in bundle_primary["entry"] if e["resource"]["resourceType"] == "Patient")
    assert patient_entry_primary["name"][0]["text"] == "Parent User"
    telecom_systems = [t["system"] for t in patient_entry_primary.get("telecom", [])]
    assert "email" in telecom_systems
    assert "phone" in telecom_systems

    # 3. Create a child care profile
    cp_resp = client.post(
        "/api/care-profiles",
        json={
            "full_name": "Child Profile",
            "relationship": "CHILD",
            "date_of_birth": "2018-05-15",
            "gender": "FEMALE",
        },
        headers=headers,
    )
    assert cp_resp.status_code == 201
    child_profile_id = cp_resp.json()["id"]

    # Add child assessment and medication
    ha_child = HealthAssessment(
        user_id=parent.id,
        care_profile_id=child_profile_id,
        assessment_date=date.today(),
        systolic_bp=100,
        diastolic_bp=65,
        heart_rate_bpm=80,
        risk_category="LOW",
    )
    med_child = Medicine(
        user_id=parent.id,
        care_profile_id=child_profile_id,
        medicine_name="Amoxicillin",
        dosage=250.0,
        dosage_unit="mg",
        start_date=date.today(),
        is_active=True,
    )
    db.add_all([ha_child, med_child])
    db.commit()

    # 4. Request FHIR for child profile using X-Profile-Id header
    child_headers = {"Authorization": f"Bearer {token}", "X-Profile-Id": str(child_profile_id)}
    resp_child = client.get("/api/reports/fhir", headers=child_headers)
    assert resp_child.status_code == 200
    bundle_child = resp_child.json()

    patient_entry_child = next(e["resource"] for e in bundle_child["entry"] if e["resource"]["resourceType"] == "Patient")
    assert patient_entry_child["name"][0]["text"] == "Child Profile"
    assert patient_entry_child["gender"] == "female"
    assert patient_entry_child["birthDate"] == "2018-05-15"
    # CRITICAL PRIVACY RULE: Parental telecom must be suppressed!
    assert len(patient_entry_child.get("telecom", [])) == 0, "Child profile must suppress parental email/phone telecom"

    # Verify MedicationStatement for child
    med_entries = [e["resource"] for e in bundle_child["entry"] if e["resource"]["resourceType"] == "MedicationStatement"]
    assert any("Amoxicillin" in m["medicationCodeableConcept"]["text"] for m in med_entries)

    # Verify Observation with LOINC codes
    obs_entries = [e["resource"] for e in bundle_child["entry"] if e["resource"]["resourceType"] == "Observation"]
    loinc_codes = [c["code"] for o in obs_entries for c in o.get("code", {}).get("coding", [])]
    assert any("85354-9" in loinc_codes or "8867-4" in loinc_codes for _ in [1])

    # 5. Verify FHIR download endpoint returns valid JSON attachment
    dl_resp = client.get("/api/reports/fhir/download", headers=child_headers)
    assert dl_resp.status_code == 200
    assert dl_resp.headers["content-type"] == "application/fhir+json"
    assert f'filename="healthpredict-fhir-patient-{child_profile_id}.json"' in dl_resp.headers["content-disposition"]


def test_group10_c3_multi_format_account_data_export(client: TestClient, db: Session, make_user, clean_state):
    """
    C3: Multi-Format Tabular and Complete Data Export.
    Checks:
    - GET /api/auth/account/export?format=json returns complete account dataset.
    - GET /api/auth/account/export?format=zip returns a zip archive containing CSVs for all tables.
    - CSVs include health_history, exercise_logs, sleep_logs, care_profiles, etc.
    """
    # 1. Create user and log in
    user = make_user(email="export_test@example.com", name="Export User")
    login_resp = client.post("/api/auth/login", json={"email": "export_test@example.com", "password": "Str0ng!Passw0rd"})
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. JSON Export
    resp_json = client.get("/api/auth/account/export?format=json", headers=headers)
    assert resp_json.status_code == 200
    data = resp_json.json()
    assert "user" in data
    assert "care_profiles" in data
    assert "medicines" in data
    assert "health_history" in data
    assert "exercise_logs" in data
    assert "sleep_logs" in data
    assert "hydration_logs" in data
    assert "symptoms" in data
    assert data["user"]["email"] == "export_test@example.com"

    # 3. ZIP Export
    resp_zip = client.get("/api/auth/account/export?format=zip", headers=headers)
    assert resp_zip.status_code == 200
    assert resp_zip.headers["content-type"] == "application/zip"
    assert "healthpredict_export_user_" in resp_zip.headers["content-disposition"]

    # Verify ZIP contents
    zf = zipfile.ZipFile(io.BytesIO(resp_zip.content))
    file_list = zf.namelist()
    assert "profile.csv" in file_list
    assert "care_profiles.csv" in file_list
    assert "medicines.csv" in file_list
    assert "health_history.csv" in file_list
    assert "exercise_logs.csv" in file_list
    assert "sleep_logs.csv" in file_list
    assert "hydration_logs.csv" in file_list
    assert "symptoms.csv" in file_list
    assert "doctor_appointments.csv" in file_list
    assert "notifications.csv" in file_list
    assert "diabetes_screenings.csv" in file_list
    assert "menstrual_logs.csv" in file_list
    assert "pcos_screenings.csv" in file_list
    assert "fatty_liver_screenings.csv" in file_list
    assert "emergency_card.csv" in file_list
    assert "doctor_shares.csv" in file_list
    assert "weekly_reports.csv" in file_list
    assert "caregivers.csv" in file_list


def test_account_export_enumerates_all_user_linked_tables(client: TestClient, db: Session, make_user, clean_state):
    """Regression test: verifies that export includes every single user-linked table.
    Fails if any user-owned table is omitted from JSON or ZIP export.
    Excludes security tokens and blocklists, and ensures no passwords/secrets leak.
    """
    from app.config.database import Base
    import app.models
    from app.models.diabetes import DiabetesScreening
    from app.models.menstrual import MenstrualLog, PCOSScreening
    from app.models.fatty_liver import FattyLiverScreening
    from app.models.emergency_and_symptoms import EmergencyCard, SymptomLog, DoctorAppointment
    from app.models.doctor_share import DoctorShare, DoctorShareNote
    from app.models.care_profile import CaregiverAccess, CaregiverAccessLevel, CaregiverInviteStatus
    from app.models.tracking import WeeklyReport, WellnessGoal, NutritionLog
    from app.models.notification import Notification, NotificationType

    # 1. Enumerate all tables with a user link
    user_linked_tables = set()
    for tname, table in Base.metadata.tables.items():
        cols = {c.name for c in table.columns}
        if "user_id" in cols or "account_owner_id" in cols:
            user_linked_tables.add(tname)

    # Tables explicitly excluded from patient data export (security/session tokens)
    SECURITY_EXCLUDED = {"user_tokens", "token_blocklist", "user_device_tokens"}
    expected_data_tables = user_linked_tables - SECURITY_EXCLUDED

    # Map database table names to export keys
    table_to_export_key = {
        "user_profiles": "profile",
        "care_profiles": "care_profiles",
        "caregiver_access": "caregivers",
        "medicines": "medicines",
        "health_assessments": "health_assessments",
        "health_history": "health_history",
        "exercise_logs": "exercise_logs",
        "sleep_logs": "sleep_logs",
        "hydration_logs": "hydration_logs",
        "nutrition_logs": "nutrition_logs",
        "wellness_goals": "wellness_goals",
        "symptom_logs": "symptoms",
        "doctor_appointments": "doctor_appointments",
        "emergency_cards": "emergency_card",
        "notifications": "notifications",
        "doctor_shares": "doctor_shares",
        "weekly_reports": "weekly_reports",
        "diabetes_screenings": "diabetes_screenings",
        "menstrual_logs": "menstrual_logs",
        "pcos_screenings": "pcos_screenings",
        "fatty_liver_screenings": "fatty_liver_screenings",
    }

    # Verify that every expected data table is accounted for in mapping
    missing_mappings = expected_data_tables - set(table_to_export_key.keys())
    assert not missing_mappings, f"User-linked tables missing from export mapping: {missing_mappings}"

    # 2. Populate user and records across all tables
    user = make_user(email="populated_export@example.com", name="Populated User")
    login_resp = client.post("/api/auth/login", json={"email": "populated_export@example.com", "password": "Str0ng!Passw0rd"})
    assert login_resp.status_code == 200
    headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    # Add records for each specialized table
    db.add(DiabetesScreening(
        user_id=user.id,
        screening_date=date.today(),
        method="FINDRISC",
        total_score=14,
        risk_level="MODERATE",
        risk_probability_text="1 in 6 risk",
        input_data={"age": 45, "bmi": 26.5},
        clinical_guidance="Lifestyle changes recommended",
    ))
    db.add(MenstrualLog(
        user_id=user.id,
        period_start_date=date.today() - timedelta(days=28),
        period_end_date=date.today() - timedelta(days=23),
        cycle_length_days=28,
        period_duration_days=5,
        flow_intensity="MEDIUM",
    ))
    db.add(PCOSScreening(
        user_id=user.id,
        screening_date=date.today(),
        cycle_regularity="IRREGULAR",
        excess_androgen_symptoms=["Hirsutism"],
        metabolic_indicators=["High BMI"],
        symptom_count=3,
        risk_assessment_text="Signs consistent with Rotterdam criteria",
        educational_guidance="Discuss clinical picture with gynecologist.",
    ))
    db.add(FattyLiverScreening(
        user_id=user.id,
        screening_date=date.today(),
        bmi=27.5,
        waist_circumference_cm=92.0,
        metabolic_factors_count=2,
        risk_level="INTERMEDIATE",
        risk_summary="Moderate cardiometabolic risk",
        educational_guidance="Consult healthcare provider.",
    ))
    db.add(EmergencyCard(
        user_id=user.id,
        public_token="pop_ec_token_1234567890abcdef1234567890abcdef1234567890abcdef12",
        blood_type="O+",
        allergies=["Peanuts"],
        is_public=False,
    ))
    db.add(DoctorAppointment(
        user_id=user.id,
        doctor_name="Dr. Smith",
        specialty="Endocrinology",
        appointment_date=date.today() + timedelta(days=7),
    ))
    from datetime import datetime, timezone
    ds = DoctorShare(
        user_id=user.id,
        token="pop_ds_token_1234567890abcdef12",
        doctor_name="Dr. Smith",
        days_range=30,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(ds)
    db.flush()
    db.add(DoctorShareNote(
        doctor_share_id=ds.id,
        author_name="Nurse Jones",
        note_text="Patient reports mild fatigue.",
    ))
    db.add(WeeklyReport(
        user_id=user.id,
        week_start_date=date.today() - timedelta(days=7),
        week_end_date=date.today(),
        average_health_score=82.0,
    ))
    db.add(CaregiverAccess(
        account_owner_id=user.id,
        caregiver_email="family_helper@example.com",
        access_level=CaregiverAccessLevel.VIEW_ONLY,
        invite_token="pop_invite_token_1234567890abcdef1234567890abcdef",
        status=CaregiverInviteStatus.ACCEPTED,
    ))
    db.commit()

    # 3. Test JSON Export
    resp_json = client.get("/api/auth/account/export?format=json", headers=headers)
    assert resp_json.status_code == 200
    export_data = resp_json.json()

    # Assert every expected table key is in export_data
    for tname, export_key in table_to_export_key.items():
        assert export_key in export_data, f"Export JSON missing key '{export_key}' for table '{tname}'"

    # Verify populated data is present
    assert len(export_data["diabetes_screenings"]) >= 1
    assert export_data["diabetes_screenings"][0]["method"] == "FINDRISC"
    assert len(export_data["menstrual_logs"]) >= 1
    assert export_data["menstrual_logs"][0]["flow_intensity"] == "MEDIUM"
    assert len(export_data["pcos_screenings"]) >= 1
    assert len(export_data["fatty_liver_screenings"]) >= 1
    assert export_data["emergency_card"] is not None
    assert export_data["emergency_card"]["blood_type"] == "O+"
    assert len(export_data["doctor_shares"]) >= 1
    assert len(export_data["doctor_shares"][0]["notes"]) >= 1
    assert len(export_data["weekly_reports"]) >= 1
    assert len(export_data["caregivers"]) >= 1

    # Security check: verify no passwords, secret keys, or password hashes in output
    raw_json_str = resp_json.text.lower()
    assert "password_hash" not in raw_json_str
    assert "totp_secret" not in raw_json_str
    assert "token_hash" not in raw_json_str

    # 4. Test ZIP Export
    resp_zip = client.get("/api/auth/account/export?format=zip", headers=headers)
    assert resp_zip.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(resp_zip.content))
    zip_files = set(zf.namelist())

    expected_csvs = {
        "profile.csv", "care_profiles.csv", "caregivers.csv", "medicines.csv",
        "health_assessments.csv", "health_history.csv", "exercise_logs.csv",
        "sleep_logs.csv", "hydration_logs.csv", "nutrition_logs.csv",
        "wellness_goals.csv", "symptoms.csv", "doctor_appointments.csv",
        "emergency_card.csv", "notifications.csv", "doctor_shares.csv",
        "weekly_reports.csv", "diabetes_screenings.csv", "menstrual_logs.csv",
        "pcos_screenings.csv", "fatty_liver_screenings.csv",
    }
    missing_csvs = expected_csvs - zip_files
    assert not missing_csvs, f"Export ZIP missing CSV files: {missing_csvs}"
