from decimal import Decimal


def test_profile_requires_auth(client):
    assert client.get("/api/profile").status_code == 401
    assert client.put("/api/profile", json={"weight_kg": 70}).status_code == 401


def test_new_profile_is_empty(client, auth_headers):
    r = client.get("/api/profile", headers=auth_headers())
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["email"] == "user@test.com"
    assert body["height_cm"] is None and body["bmi"] is None


def test_update_keeps_decimals_and_returns_generated_bmi(client, auth_headers):
    h = auth_headers()
    r = client.put("/api/profile", headers=h, json={"height_cm": 170.5, "weight_kg": 72.5})
    assert r.status_code == 200
    body = r.json()
    assert Decimal(str(body["weight_kg"])) == Decimal("72.5")     # not truncated to 72
    assert round(float(body["bmi"]), 2) == 24.94                  # 72.5 / 1.705^2
    # and it persists
    again = client.get("/api/profile", headers=h).json()
    assert round(float(again["bmi"]), 2) == 24.94


def test_partial_update_only_changes_sent_fields(client, auth_headers):
    h = auth_headers()
    client.put("/api/profile", headers=h, json={"height_cm": 180, "smoking_status": "FORMER"})
    client.put("/api/profile", headers=h, json={"weight_kg": 80})
    body = client.get("/api/profile", headers=h).json()
    assert float(body["height_cm"]) == 180 and body["smoking_status"] == "FORMER" and float(body["weight_kg"]) == 80


def test_updates_account_and_lists(client, auth_headers):
    h = auth_headers()
    r = client.put("/api/profile", headers=h, json={
        "full_name": "  Renamed User ", "gender": "MALE", "allergies": ["Peanuts", " ", "Dust"],
        "existing_conditions": ["Asthma"],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["full_name"] == "Renamed User"
    assert body["allergies"] == ["Peanuts", "Dust"] and body["existing_conditions"] == ["Asthma"]


def test_out_of_range_values_are_rejected(client, auth_headers):
    h = auth_headers()
    for payload in ({"height_cm": 10}, {"weight_kg": 900}, {"sleep_duration_hours": 30},
                    {"blood_type": "Z+"}, {"smoking_status": "SOMETIMES"}, {"water_intake_goal_ml": 50}):
        assert client.put("/api/profile", headers=h, json=payload).status_code == 422, payload


def test_cannot_escalate_privileges_via_profile_update(client, auth_headers, db):
    """Mass-assignment: role / is_active / email must not be settable through the profile endpoint."""
    from app.models import User
    h = auth_headers()
    for payload in ({"role": "ADMIN"}, {"is_active": False}, {"email": "x@y.com"}, {"password_hash": "abc"}):
        assert client.put("/api/profile", headers=h, json=payload).status_code == 422, payload
    db.expire_all()
    assert db.query(User).filter_by(email="user@test.com").one().role == "USER"


def test_users_only_see_their_own_profile(client, auth_headers):
    a = auth_headers("a@test.com")
    b = auth_headers("b@test.com")
    client.put("/api/profile", headers=a, json={"weight_kg": 65})
    assert client.get("/api/profile", headers=b).json()["weight_kg"] is None


def test_cholesterol_level_field(client, auth_headers):
    h = auth_headers()
    r = client.put("/api/profile", headers=h, json={"cholesterol_level": "ABOVE_NORMAL"})
    assert r.status_code == 200 and r.json()["cholesterol_level"] == "ABOVE_NORMAL"
    assert client.put("/api/profile", headers=h, json={"cholesterol_level": "VERY_HIGH"}).status_code == 422
    # unset by default, like smoking_status/alcohol_consumption
    fresh = auth_headers("fresh@test.com")
    assert client.get("/api/profile", headers=fresh).json()["cholesterol_level"] is None
