"""Integration tests for Phase 1: Unified Personal Health Timeline.

Validates multi-stream health event aggregation, category filtering,
date range boundaries, profile isolation, and data-provenance labeling.
"""

from datetime import date, datetime, time, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    CareProfile, ExerciseLog, HealthAssessment, HealthPrediction,
    HydrationLog, Medicine, MedicineSchedule, NutritionLog, SleepLog,
    SymptomLog, User
)


def test_timeline_requires_auth(client: TestClient):
    """GET /api/health/timeline requires authenticated user."""
    res = client.get("/api/health/timeline")
    assert res.status_code == 401


def test_timeline_aggregates_across_subsystems(client: TestClient, db: Session, make_user, clean_state):
    """Timeline successfully combines assessments, predictions, vitals, tracking, symptoms, and meds."""
    user = make_user(email="timeline_user@example.com", name="Timeline Subject")
    login_res = client.post("/api/auth/login", json={"email": "timeline_user@example.com", "password": "Str0ng!Passw0rd"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    today = date.today()

    # 1. Add HealthAssessment + Prediction
    ha = HealthAssessment(
        user_id=user.id,
        assessment_date=today,
        systolic_bp=120,
        diastolic_bp=80,
        heart_rate_bpm=72,
        blood_glucose_mg_dl=95,
        health_score=88.5,
        risk_category="LOW",
        assessment_notes="Baseline checkup",
    )
    db.add(ha)
    db.flush()

    pred = HealthPrediction(
        assessment_id=ha.id,
        risk_level="LOW",
        prediction_score=0.1200,
        model_version="1.0.0",
        prediction_factors=[{"feature": "systolic_bp", "importance": 0.45}],
    )
    db.add(pred)

    # 2. Add ExerciseLog
    ex = ExerciseLog(
        user_id=user.id,
        exercise_date=today,
        exercise_type="Jogging",
        duration_minutes=30,
        intensity="MODERATE",
        calories_burned=240,
        source="manual",
    )
    db.add(ex)

    # 3. Add SleepLog
    sl = SleepLog(
        user_id=user.id,
        sleep_date=today,
        sleep_duration_hours=7.5,
        sleep_quality=4,
        source="manual",
    )
    db.add(sl)

    # 4. Add HydrationLog
    hy = HydrationLog(
        user_id=user.id,
        hydration_date=today,
        water_intake_ml=750,
        entry_time=time(10, 30),
    )
    db.add(hy)

    # 5. Add NutritionLog
    nu = NutritionLog(
        user_id=user.id,
        nutrition_date=today,
        meal_type="LUNCH",
        food_item="Steamed rice and lentils",
        calories=450,
    )
    db.add(nu)

    # 6. Add SymptomLog
    sy = SymptomLog(
        user_id=user.id,
        symptom_name="Mild Headache",
        severity=3,
        logged_at=datetime.now(timezone.utc),
    )
    db.add(sy)

    # 7. Add Medicine + Schedule
    med = Medicine(
        user_id=user.id,
        medicine_name="Vitamin C",
        dosage=500.0,
        dosage_unit="mg",
        start_date=today,
        is_active=True,
    )
    db.add(med)
    db.flush()

    sched = MedicineSchedule(
        medicine_id=med.id,
        scheduled_date=today,
        scheduled_time=time(9, 0),
        is_taken=True,
        taken_at=datetime.combine(today, time(9, 5)),
    )
    db.add(sched)
    db.commit()

    # Query Timeline API
    res = client.get("/api/health/timeline", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["total_events"] >= 7
    event_categories = {e["category"] for e in data["events"]}
    assert "ASSESSMENT" in event_categories
    assert "EXERCISE" in event_categories
    assert "SLEEP" in event_categories
    assert "HYDRATION" in event_categories
    assert "NUTRITION" in event_categories
    assert "SYMPTOM" in event_categories
    assert "MEDICATION" in event_categories

    # Verify data source provenance labels
    sources = {e["data_source"] for e in data["events"]}
    assert "MEASURED" in sources or "SELF_REPORTED" in sources
    assert "MODEL_ESTIMATE" in sources


def test_timeline_category_filter(client: TestClient, db: Session, make_user, clean_state):
    """Category parameter restricts events to chosen stream."""
    user = make_user(email="filter_user@example.com", name="Filter Subject")
    login_res = client.post("/api/auth/login", json={"email": "filter_user@example.com", "password": "Str0ng!Passw0rd"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    today = date.today()
    ex = ExerciseLog(user_id=user.id, exercise_date=today, exercise_type="Yoga", duration_minutes=25)
    hy = HydrationLog(user_id=user.id, hydration_date=today, water_intake_ml=500)
    db.add_all([ex, hy])
    db.commit()

    res = client.get("/api/health/timeline?categories=EXERCISE", headers=headers)
    assert res.status_code == 200
    events = res.json()["events"]
    assert len(events) >= 1
    assert all(e["category"] == "EXERCISE" for e in events)


def test_timeline_profile_isolation(client: TestClient, db: Session, make_user, clean_state):
    """Events recorded for Child care profile are NOT mixed into Primary profile timeline without scope header."""
    parent = make_user(email="parent_tl@example.com", name="Parent Account")
    login_res = client.post("/api/auth/login", json={"email": "parent_tl@example.com", "password": "Str0ng!Passw0rd"})
    token = login_res.json()["access_token"]
    parent_headers = {"Authorization": f"Bearer {token}"}

    # Create child care profile
    cp_res = client.post(
        "/api/care-profiles",
        json={"full_name": "Child Member", "relationship": "CHILD", "date_of_birth": "2018-01-01", "gender": "FEMALE"},
        headers=parent_headers,
    )
    assert cp_res.status_code == 201
    child_id = cp_res.json()["id"]

    today = date.today()
    # Log parent exercise
    ex_parent = ExerciseLog(user_id=parent.id, exercise_date=today, exercise_type="Parent Walking", duration_minutes=40)
    # Log child symptom
    sy_child = SymptomLog(user_id=parent.id, care_profile_id=child_id, symptom_name="Child Cough", severity=4, logged_at=datetime.now(timezone.utc))
    db.add_all([ex_parent, sy_child])
    db.commit()

    # Query Parent timeline (default primary profile)
    res_parent = client.get("/api/health/timeline", headers=parent_headers)
    assert res_parent.status_code == 200
    parent_titles = [e["title"] for e in res_parent.json()["events"]]
    assert any("Parent Walking" in t for t in parent_titles)
    assert not any("Child Cough" in t for t in parent_titles), "Child symptom must NOT leak into Parent timeline"

    # Query Child timeline using X-Profile-Id
    child_headers = {"Authorization": f"Bearer {token}", "X-Profile-Id": str(child_id)}
    res_child = client.get("/api/health/timeline", headers=child_headers)
    assert res_child.status_code == 200
    child_titles = [e["title"] for e in res_child.json()["events"]]
    assert any("Child Cough" in t for t in child_titles)
    assert not any("Parent Walking" in t for t in child_titles), "Parent walking must NOT appear in Child timeline"
