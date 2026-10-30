"""Nutrition and Personalized Meal Planning API Routes.

Provides endpoints for curated food catalog retrieval, personalized weekly meal
plan generation, healthy meal substitutions, and automated grocery lists.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.services import meal_planner_service
from app.services.meal_planner_service import MealPlanPreference

router = APIRouter(prefix="/nutrition", tags=["Nutrition & Meal Planning"])


@router.get("/catalog")
def get_food_items(
    category: Optional[str] = Query(None, description="BREAKFAST | LUNCH | SNACKS | DINNER"),
    diet_type: Optional[str] = Query(None, description="VEGETARIAN | NON_VEGETARIAN | VEGAN"),
    allergies: Optional[List[str]] = Query(None, description="Allergies to filter out"),
):
    """Retrieve items from the curated balanced food and macronutrient catalog."""
    return meal_planner_service.get_food_catalog(category, diet_type, allergies)


@router.post("/meal-plan")
def generate_user_meal_plan(
    preferences: MealPlanPreference,
    user: User = Depends(get_current_user),
):
    """Generate a 7-day personalized meal plan and grocery list."""
    return meal_planner_service.generate_meal_plan(preferences)


@router.get("/substitutions/{food_id}")
def get_meal_substitutions(
    food_id: str,
    user: User = Depends(get_current_user),
):
    """Retrieve healthy alternative options for a specific meal."""
    return meal_planner_service.find_substitutions(food_id)
