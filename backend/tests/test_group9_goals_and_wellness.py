"""Group 9 Automated Integration Tests: Goals & Wellness Engine.

Covers:
- W1: Wearable Device Sync Mock / Ingestion (Apple Health, Google Fit, Fitbit idempotent upserts)
- W2: Dynamic Personalized Goal Recommendations (clinically backed targets by baseline activity & risk)
- W3: Multi-Factor Wellness Correlation Engine (Pearson r, sample size validation >= 5 days, honest messaging)
"""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config.database import SessionLocal
from app.main import app
from app.models.emergency_and_symptoms import SymptomLog
from app.models.health import HealthAssessment
from app.models.medicine import Medicine, MedicineSchedule
from app.models.tracking import ExerciseLog, SleepLog, WellnessGoal
from app.models.user import User


@pytest.fixture
def test_user(db: Session):
    """Fixture providing a primary test user."""
    email = f"group9_user_{datetime.now().timestamp()}@example.com"
    user = User(
        email=email,
        password_hash="hashed_pw_group9",
        full_name="Taylor Swift",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User):
    """Fixture providing auth headers for the primary test user."""
    from app.utils.security import create_access_token
    token_str, _ = create_access_token(test_user.id, "USER")
    return {"Authorization": f"Bearer {token_str}"}


# ============================================================================
# W1: WEARABLE DEVICE SYNC MOCK / INGESTION TESTS
# ============================================================================

def test_wearable_sync_ingestion_and_idempotency(test_user: User, auth_headers: dict, db: Session):
    client = TestClient(app)
    today = date.today()

    payload = {
        "source": "apple_health",
        "exercises": [
            {
                "exercise_date": str(today - timedelta(days=1)),
                "exercise_type": "Outdoor Running",
                "duration_minutes": 45,
                "intensity": "HIGH",
                "calories_burned": 420,
                "distance_km": 6.2,
                "notes": "Synced via Apple Watch Series 9",
            },
            {
                "exercise_date": str(today),
                "exercise_type": "Functional Strength",
                "duration_minutes": 35,
                "intensity": "MODERATE",
                "calories_burned": 250,
            }
        ],
        "sleeps": [
            {
                "sleep_date": str(today - timedelta(days=1)),
                "bedtime": "23:00:00",
                "wake_time": "07:15:00",
                "duration_hours": 8.25,
                "sleep_quality": 8,
                "interruptions": 1,
                "deep_sleep_hours": 1.75,
                "notes": "Sleep stages recorded by watchOS",
            }
        ]
    }

    # 1. Ingest batch
    res = client.post("/api/wearables/sync", json=payload, headers=auth_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["source"] == "apple_health"
    assert data["exercises_synced"] == 2
    assert data["sleeps_synced"] == 1

    # Verify rows in DB have source='apple_health'
    with SessionLocal() as s:
        ex_rows = s.query(ExerciseLog).filter(ExerciseLog.user_id == test_user.id).all()
        assert len(ex_rows) == 2
        assert all(e.source == "apple_health" for e in ex_rows)

        sl_rows = s.query(SleepLog).filter(SleepLog.user_id == test_user.id).all()
        assert len(sl_rows) == 1
        assert sl_rows[0].source == "apple_health"
        assert float(sl_rows[0].sleep_duration_hours) == 8.25

    # 2. Idempotent re-sync with updated duration
    payload["exercises"][0]["duration_minutes"] = 50
    res2 = client.post("/api/wearables/sync", json=payload, headers=auth_headers)
    assert res2.status_code == 200

    with SessionLocal() as s:
        ex_rows = s.query(ExerciseLog).filter(ExerciseLog.user_id == test_user.id).all()
        # Count should still be 2 (upserted, not duplicated)
        assert len(ex_rows) == 2
        run_log = next(e for e in ex_rows if e.exercise_type == "Outdoor Running")
        assert run_log.duration_minutes == 50


# ============================================================================
# W2: DYNAMIC GOAL RECOMMENDATIONS TESTS
# ============================================================================

def test_dynamic_goal_recommendations(test_user: User, auth_headers: dict, db: Session):
    client = TestClient(app)

    # User with baseline data
    today = date.today()
    med = Medicine(
        user_id=test_user.id,
        medicine_name="Metformin",
        is_active=True,
        start_date=today - timedelta(days=10),
    )
    assessment = HealthAssessment(
        user_id=test_user.id,
        assessment_date=today,
        health_score=65.0,
        risk_category="HIGH",
    )
    db.add_all([med, assessment])
    db.commit()

    res = client.get("/api/goals/recommendations", headers=auth_headers)
    assert res.status_code == 200, res.text
    rec_data = res.json()

    assert "recommendations" in rec_data
    assert "user_context" in rec_data
    recs = rec_data["recommendations"]

    # Verify categories recommended
    goal_types = {r["goal_type"] for r in recs}
    assert "EXERCISE" in goal_types
    assert "SLEEP" in goal_types
    assert "HYDRATION" in goal_types
    assert "MEDICINE_ADHERENCE" in goal_types

    med_rec = next(r for r in recs if r["goal_type"] == "MEDICINE_ADHERENCE")
    assert med_rec["category"] == "adherence"
    assert "1 active prescription" in med_rec["rationale"]

    assert rec_data["user_context"]["risk_level"] == "HIGH"


# ============================================================================
# W3: MULTI-FACTOR WELLNESS CORRELATION ENGINE TESTS
# ============================================================================

def test_wellness_correlations_insufficient_and_sufficient_data(test_user: User, auth_headers: dict, db: Session):
    client = TestClient(app)
    today = date.today()

    # 1. Test with insufficient data (< 5 days)
    res_empty = client.get("/api/correlations?days=30", headers=auth_headers)
    assert res_empty.status_code == 200
    empty_data = res_empty.json()
    assert len(empty_data["correlations"]) == 3
    assert all(c["has_sufficient_data"] is False for c in empty_data["correlations"])
    assert all(c["correlation_coefficient"] is None for c in empty_data["correlations"])
    assert "Need at least 5" in empty_data["correlations"][0]["insight_summary"]

    # 2. Populate 6 days of paired data
    # Pair 1: Exercise minutes vs Sleep quality (positive trend: more exercise -> higher quality)
    exercise_durations = [20, 30, 45, 60, 50, 70]
    sleep_qualities = [5, 6, 7, 9, 8, 10]

    for i in range(6):
        d = today - timedelta(days=6 - i)
        ex = ExerciseLog(
            user_id=test_user.id,
            exercise_date=d,
            exercise_type="Jogging",
            duration_minutes=exercise_durations[i],
        )
        sl = SleepLog(
            user_id=test_user.id,
            sleep_date=d,
            sleep_duration_hours=Decimal("7.5"),
            sleep_quality=sleep_qualities[i],
        )
        db.add_all([ex, sl])

    db.commit()

    # 3. Query correlations again
    res_sufficient = client.get("/api/correlations?days=30", headers=auth_headers)
    assert res_sufficient.status_code == 200, res_sufficient.text
    corr_data = res_sufficient.json()

    ex_sleep_corr = next(c for c in corr_data["correlations"] if c["pair_name"] == "Exercise vs Sleep Quality")
    assert ex_sleep_corr["has_sufficient_data"] is True
    assert ex_sleep_corr["sample_size_days"] == 6
    assert ex_sleep_corr["correlation_coefficient"] is not None
    # Because exercise_durations and sleep_qualities are strongly co-linear, r should be > 0.8
    assert ex_sleep_corr["correlation_coefficient"] > 0.7
    assert ex_sleep_corr["direction"] == "positive"
    assert "Strong positive link" in ex_sleep_corr["insight_summary"]
