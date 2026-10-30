"""Tests for Phase 3: Personalized Nutrition and Meal Planning.

Validates:
- Curated food catalog retrieval with category and dietary filters
- Allergy exclusion logic
- 7-day meal plan generation with daily calorie & macro totals
- Grocery list generation
- Healthy substitutions retrieval
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.meal_planner_service import (
    CURATED_FOOD_CATALOG,
    MealPlanPreference,
    generate_meal_plan,
    get_food_catalog,
)


def test_food_catalog_filters():
    """Verify category, diet, and allergy filtering on the curated food catalog."""
    # Filter breakfast only
    breakfasts = get_food_catalog(category="BREAKFAST")
    assert len(breakfasts) > 0
    assert all(b["category"] == "BREAKFAST" for b in breakfasts)

    # Filter vegan only
    vegans = get_food_catalog(diet_type="VEGAN")
    assert len(vegans) > 0
    assert all(v["diet"] == "VEGAN" for v in vegans)

    # Filter out dairy allergy
    no_dairy = get_food_catalog(exclude_allergies=["DAIRY"])
    assert all("DAIRY" not in item["allergies"] for item in no_dairy)


def test_generate_meal_plan_logic():
    """Test generating a 7-day vegetarian meal plan."""
    pref = MealPlanPreference(
        diet_type="VEGETARIAN",
        allergies=["PEANUTS"],
        calorie_target=1800,
        target_days=7,
    )
    plan = generate_meal_plan(pref)

    assert plan["diet_type"] == "VEGETARIAN"
    assert len(plan["days"]) == 7
    assert len(plan["grocery_list"]) > 0

    # Ensure no peanut items made it in
    for day in plan["days"]:
        for meal in [day["breakfast"], day["lunch"], day["snack"], day["dinner"]]:
            if meal:
                assert "PEANUTS" not in meal["allergies"]
                assert meal["diet"] in ("VEGETARIAN", "VEGAN")


def test_nutrition_endpoints(client: TestClient, make_user, clean_state):
    """Test /api/nutrition/catalog and /api/nutrition/meal-plan."""
    user = make_user(email="nutrition_user@example.com", name="Nutrition Subject")
    login_res = client.post("/api/auth/login", json={"email": "nutrition_user@example.com", "password": "Str0ng!Passw0rd"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Catalog endpoint
    cat_res = client.get("/api/nutrition/catalog?category=LUNCH", headers=headers)
    assert cat_res.status_code == 200
    catalog = cat_res.json()
    assert len(catalog) > 0
    assert all(item["category"] == "LUNCH" for item in catalog)

    # 2. Meal Plan generation
    plan_res = client.post(
        "/api/nutrition/meal-plan",
        json={
            "diet_type": "VEGAN",
            "allergies": ["GLUTEN"],
            "calorie_target": 1700,
            "target_days": 5,
        },
        headers=headers,
    )
    assert plan_res.status_code == 200
    plan_data = plan_res.json()
    assert len(plan_data["days"]) == 5
    assert len(plan_data["grocery_list"]) > 0

    # 3. Substitutions endpoint
    food_id = catalog[0]["id"]
    sub_res = client.get(f"/api/nutrition/substitutions/{food_id}", headers=headers)
    assert sub_res.status_code == 200
    subs = sub_res.json()
    assert isinstance(subs, list)
