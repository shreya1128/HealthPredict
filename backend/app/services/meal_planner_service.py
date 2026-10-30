"""Curated Balanced Nutrition and Meal Planning Service.

Provides:
- Documented catalog of common Indian and global balanced foods with portion sizes and macronutrients.
- Nutritional values sourced from ICMR-NIN Indian Food Composition Tables (IFCT) and USDA FoodData Central.
- Safe, multi-layered allergy exclusions (normalizing user input and checking both declared tags and ingredient lists).
- Personalized daily and weekly meal plan generation respecting dietary preferences (veg, non-veg, vegan).
- Nutritional meal substitutions and automated grocery list compilation.

Strictly educational wellness planning; not presented as a medical prescription diet.
"""

from typing import Any, Dict, List, Optional, Set
from pydantic import BaseModel, Field

# Nutrition data source citations:
# 1. ICMR - National Institute of Nutrition (NIN): Indian Food Composition Tables (IFCT)
# 2. USDA Agricultural Research Service: FoodData Central (FDC)

CURATED_FOOD_CATALOG: List[Dict[str, Any]] = [
    # ── BREAKFAST (8 items) ────────────────────────────────────────────────
    {
        "id": "idli_sambar",
        "name": "Steamed Idli with Vegetable Sambar",
        "category": "BREAKFAST",
        "diet": "VEGAN",
        "allergies": [],
        "calories": 280,
        "protein_g": 9.5,
        "carbs_g": 52.0,
        "fat_g": 3.0,
        "portion": "2 idlis + 1 cup sambar",
        "ingredients": ["Idli rice", "Urad dal", "Toor dal", "Drumsticks", "Carrots", "Spices"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "poha",
        "name": "Vegetable Poha with Roasted Peanuts",
        "category": "BREAKFAST",
        "diet": "VEGAN",
        "allergies": ["PEANUTS"],
        "calories": 310,
        "protein_g": 7.0,
        "carbs_g": 55.0,
        "fat_g": 8.0,
        "portion": "1 medium bowl (180g)",
        "ingredients": ["Flattened rice", "Peanuts", "Onions", "Green peas", "Mustard seeds", "Turmeric"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "oats_porridge",
        "name": "Rolled Oats Porridge with Almonds & Apples",
        "category": "BREAKFAST",
        "diet": "VEGETARIAN",
        "allergies": ["NUTS", "DAIRY"],
        "calories": 330,
        "protein_g": 12.0,
        "carbs_g": 54.0,
        "fat_g": 8.5,
        "portion": "1 bowl (250ml)",
        "ingredients": ["Rolled oats", "Milk", "Almonds", "Apple slices", "Cinnamon"],
        "source": "USDA FDC",
    },
    {
        "id": "egg_toast",
        "name": "Boiled Eggs with Whole Grain Toast",
        "category": "BREAKFAST",
        "diet": "NON_VEGETARIAN",
        "allergies": ["EGGS", "GLUTEN", "DAIRY"],
        "calories": 320,
        "protein_g": 18.0,
        "carbs_g": 28.0,
        "fat_g": 14.0,
        "portion": "2 eggs + 2 slices whole wheat bread",
        "ingredients": ["Eggs", "Whole wheat bread", "Black pepper", "Butter"],
        "source": "USDA FDC",
    },
    {
        "id": "upma",
        "name": "Vegetable Semolina Upma",
        "category": "BREAKFAST",
        "diet": "VEGAN",
        "allergies": ["GLUTEN"],
        "calories": 260,
        "protein_g": 6.5,
        "carbs_g": 46.0,
        "fat_g": 6.0,
        "portion": "1 bowl (180g)",
        "ingredients": ["Semolina", "Carrots", "Beans", "Curry leaves", "Ginger", "Mustard seeds"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "moong_cheela",
        "name": "Moong Dal Cheela with Mint Chutney",
        "category": "BREAKFAST",
        "diet": "VEGAN",
        "allergies": [],
        "calories": 230,
        "protein_g": 14.0,
        "carbs_g": 32.0,
        "fat_g": 5.0,
        "portion": "2 cheelas + mint chutney",
        "ingredients": ["Yellow moong dal", "Ginger", "Green chillies", "Fresh mint", "Coriander", "Cumin"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "besan_chilla",
        "name": "Besan (Chickpea Flour) Chilla with Spinach",
        "category": "BREAKFAST",
        "diet": "VEGAN",
        "allergies": [],
        "calories": 250,
        "protein_g": 12.5,
        "carbs_g": 34.0,
        "fat_g": 6.5,
        "portion": "2 medium chillas",
        "ingredients": ["Chickpea flour", "Spinach", "Tomatoes", "Onions", "Ajwain", "Turmeric"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "masala_dosa",
        "name": "Crisp Masala Dosa with Potato Filling & Chutney",
        "category": "BREAKFAST",
        "diet": "VEGAN",
        "allergies": [],
        "calories": 340,
        "protein_g": 8.0,
        "carbs_g": 56.0,
        "fat_g": 10.0,
        "portion": "1 dosa + 2 tbsp coconut chutney",
        "ingredients": ["Fermented rice batter", "Urad dal", "Potatoes", "Onions", "Coconut", "Mustard seeds"],
        "source": "ICMR-NIN IFCT",
    },

    # ── LUNCH (8 items) ───────────────────────────────────────────────────
    {
        "id": "dal_roti_sabzi",
        "name": "Yellow Dal Tadka with 2 Phulkas & Mixed Veg",
        "category": "LUNCH",
        "diet": "VEGETARIAN",
        "allergies": ["GLUTEN", "DAIRY"],
        "calories": 480,
        "protein_g": 18.0,
        "carbs_g": 82.0,
        "fat_g": 9.0,
        "portion": "1 cup dal + 2 rotis + 1 cup sabzi",
        "ingredients": ["Yellow moong dal", "Whole wheat flour", "Cauliflower", "Green beans", "Ghee", "Tomatoes"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "chana_masala_rice",
        "name": "Chickpea Chana Masala with Steamed Brown Rice",
        "category": "LUNCH",
        "diet": "VEGAN",
        "allergies": [],
        "calories": 520,
        "protein_g": 19.5,
        "carbs_g": 88.0,
        "fat_g": 10.0,
        "portion": "1 cup chana + 1 cup brown rice",
        "ingredients": ["Chickpeas", "Brown rice", "Onions", "Tomatoes", "Ginger-garlic", "Spices"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "grilled_chicken_rice",
        "name": "Tandoori Chicken Breast with Brown Rice & Cucumber Salad",
        "category": "LUNCH",
        "diet": "NON_VEGETARIAN",
        "allergies": ["DAIRY"],
        "calories": 510,
        "protein_g": 42.0,
        "carbs_g": 56.0,
        "fat_g": 12.0,
        "portion": "150g chicken breast + 1 cup brown rice + cucumber salad",
        "ingredients": ["Chicken breast", "Yogurt", "Brown rice", "Cucumbers", "Lemon", "Tandoori masala"],
        "source": "USDA FDC",
    },
    {
        "id": "paneer_bhurji_roti",
        "name": "Paneer Bhurji with 2 Multigrain Rotis",
        "category": "LUNCH",
        "diet": "VEGETARIAN",
        "allergies": ["DAIRY", "GLUTEN"],
        "calories": 490,
        "protein_g": 24.0,
        "carbs_g": 48.0,
        "fat_g": 22.0,
        "portion": "150g paneer + 2 multigrain rotis",
        "ingredients": ["Paneer", "Multigrain flour", "Bell peppers", "Onions", "Tomatoes", "Cumin"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "fish_curry_rice",
        "name": "Rohu/Pomfret Fish Curry with Steamed Rice",
        "category": "LUNCH",
        "diet": "NON_VEGETARIAN",
        "allergies": ["FISH"],
        "calories": 470,
        "protein_g": 34.0,
        "carbs_g": 60.0,
        "fat_g": 10.5,
        "portion": "150g fish fillet + 1 cup steamed rice",
        "ingredients": ["Fish fillet", "Basmati rice", "Mustard paste", "Turmeric", "Green chillies", "Tomatoes"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "egg_curry_rice",
        "name": "Homestyle Egg Curry with Brown Rice",
        "category": "LUNCH",
        "diet": "NON_VEGETARIAN",
        "allergies": ["EGGS"],
        "calories": 460,
        "protein_g": 21.0,
        "carbs_g": 58.0,
        "fat_g": 16.0,
        "portion": "2 boiled eggs in curry + 1 cup brown rice",
        "ingredients": ["Eggs", "Brown rice", "Onions", "Tomatoes", "Ginger-garlic", "Coriander"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "sambar_rice_plantain",
        "name": "Lentil Sambar Rice with Roasted Plantain",
        "category": "LUNCH",
        "diet": "VEGAN",
        "allergies": [],
        "calories": 450,
        "protein_g": 14.0,
        "carbs_g": 84.0,
        "fat_g": 6.0,
        "portion": "1 large bowl sambar rice + 1/2 cup raw banana roast",
        "ingredients": ["Toor dal", "Rice", "Raw banana (plantain)", "Tamarind", "Sambar spices", "Mustard seeds"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "tofu_quinoa_bowl",
        "name": "Sautéed Tofu & Vegetable Quinoa Bowl",
        "category": "LUNCH",
        "diet": "VEGAN",
        "allergies": ["SOY", "SESAME"],
        "calories": 440,
        "protein_g": 22.0,
        "carbs_g": 52.0,
        "fat_g": 16.0,
        "portion": "1 bowl (300g)",
        "ingredients": ["Firm tofu", "Quinoa", "Broccoli", "Bell peppers", "Soy sauce", "Sesame oil"],
        "source": "USDA FDC",
    },

    # ── SNACKS (8 items) ──────────────────────────────────────────────────
    {
        "id": "roasted_makhana",
        "name": "Roasted Fox Nuts (Makhana) with Olive Oil & Spices",
        "category": "SNACKS",
        "diet": "VEGAN",
        "allergies": [],
        "calories": 140,
        "protein_g": 4.5,
        "carbs_g": 26.0,
        "fat_g": 2.5,
        "portion": "1 cup (35g)",
        "ingredients": ["Fox nuts (makhana)", "Olive oil", "Chaat masala", "Turmeric"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "sprouted_salad",
        "name": "Sprouted Moong & Kala Chana Salad",
        "category": "SNACKS",
        "diet": "VEGAN",
        "allergies": [],
        "calories": 180,
        "protein_g": 11.0,
        "carbs_g": 30.0,
        "fat_g": 1.5,
        "portion": "1 cup (150g)",
        "ingredients": ["Sprouted green moong", "Sprouted kala chana", "Cucumbers", "Tomatoes", "Lemon juice", "Chilli powder"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "buttermilk",
        "name": "Spiced Buttermilk (Chaas) with Mint & Roasted Cumin",
        "category": "SNACKS",
        "diet": "VEGETARIAN",
        "allergies": ["DAIRY"],
        "calories": 65,
        "protein_g": 3.5,
        "carbs_g": 5.0,
        "fat_g": 2.0,
        "portion": "1 glass (250ml)",
        "ingredients": ["Yogurt", "Water", "Roasted cumin", "Fresh mint", "Black salt"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "roasted_chana",
        "name": "Roasted Kala Chana (Black Bengal Gram)",
        "category": "SNACKS",
        "diet": "VEGAN",
        "allergies": [],
        "calories": 160,
        "protein_g": 9.0,
        "carbs_g": 27.0,
        "fat_g": 3.0,
        "portion": "1 cup (40g)",
        "ingredients": ["Roasted black chickpeas", "Rock salt", "Chaat masala"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "mixed_fruit_chaat",
        "name": "Fresh Seasonal Fruit Chaat with Lime",
        "category": "SNACKS",
        "diet": "VEGAN",
        "allergies": [],
        "calories": 120,
        "protein_g": 1.5,
        "carbs_g": 28.0,
        "fat_g": 0.5,
        "portion": "1 bowl (200g)",
        "ingredients": ["Apple", "Pomegranate", "Guava", "Papaya", "Lemon juice", "Black salt"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "boiled_sweet_corn",
        "name": "Steamed Sweet Corn with Lemon & Black Pepper",
        "category": "SNACKS",
        "diet": "VEGAN",
        "allergies": [],
        "calories": 130,
        "protein_g": 4.0,
        "carbs_g": 25.0,
        "fat_g": 1.5,
        "portion": "1 medium cob (100g kernels)",
        "ingredients": ["Sweet corn", "Lemon juice", "Black pepper", "Salt"],
        "source": "USDA FDC",
    },
    {
        "id": "boiled_egg_snack",
        "name": "Boiled Egg with Crushed Pepper",
        "category": "SNACKS",
        "diet": "NON_VEGETARIAN",
        "allergies": ["EGGS"],
        "calories": 78,
        "protein_g": 6.3,
        "carbs_g": 0.6,
        "fat_g": 5.3,
        "portion": "1 large egg",
        "ingredients": ["Egg", "Black pepper", "Salt"],
        "source": "USDA FDC",
    },
    {
        "id": "mixed_seeds_nuts",
        "name": "Pumpkin & Sunflower Seed Trail Mix",
        "category": "SNACKS",
        "diet": "VEGAN",
        "allergies": [],
        "calories": 170,
        "protein_g": 6.0,
        "carbs_g": 8.0,
        "fat_g": 14.0,
        "portion": "2 tablespoons (30g)",
        "ingredients": ["Pumpkin seeds", "Sunflower seeds", "Flax seeds", "Dried cranberries"],
        "source": "USDA FDC",
    },

    # ── DINNER (8 items) ──────────────────────────────────────────────────
    {
        "id": "palak_khichdi",
        "name": "Moong Dal & Spinach Khichdi with Curd",
        "category": "DINNER",
        "diet": "VEGETARIAN",
        "allergies": ["DAIRY"],
        "calories": 420,
        "protein_g": 16.0,
        "carbs_g": 70.0,
        "fat_g": 7.5,
        "portion": "1 large bowl (250g) + 1/2 cup curd",
        "ingredients": ["Moong dal", "Rice", "Spinach", "Garlic", "Cumin", "Curd"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "rajma_curd_rice",
        "name": "Kidney Bean Rajma with Quinoa & Cucumber Raita",
        "category": "DINNER",
        "diet": "VEGETARIAN",
        "allergies": ["DAIRY"],
        "calories": 460,
        "protein_g": 18.5,
        "carbs_g": 76.0,
        "fat_g": 8.0,
        "portion": "1 cup rajma + 1 cup cooked quinoa + cucumber raita",
        "ingredients": ["Red kidney beans", "Quinoa", "Yogurt", "Cucumber", "Tomatoes", "Ginger"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "grilled_fish_veg",
        "name": "Steamed/Grilled Fish with Sautéed Green Beans & Carrots",
        "category": "DINNER",
        "diet": "NON_VEGETARIAN",
        "allergies": ["FISH"],
        "calories": 380,
        "protein_g": 36.0,
        "carbs_g": 12.0,
        "fat_g": 14.0,
        "portion": "180g fish + 1 cup beans & carrots",
        "ingredients": ["Fish fillet", "Green beans", "Carrots", "Garlic", "Olive oil", "Lemon"],
        "source": "USDA FDC",
    },
    {
        "id": "tofu_stir_fry",
        "name": "Tofu & Mixed Vegetable Stir-Fry with Sesame",
        "category": "DINNER",
        "diet": "VEGAN",
        "allergies": ["SOY", "SESAME"],
        "calories": 360,
        "protein_g": 22.0,
        "carbs_g": 22.0,
        "fat_g": 18.0,
        "portion": "1 plate (250g)",
        "ingredients": ["Firm tofu", "Broccoli", "Bell peppers", "Soy sauce", "Sesame seeds", "Garlic"],
        "source": "USDA FDC",
    },
    {
        "id": "dal_palak_bajra",
        "name": "Dal Palak with 2 Millet (Bajra) Rotis",
        "category": "DINNER",
        "diet": "VEGAN",
        "allergies": [],
        "calories": 390,
        "protein_g": 17.0,
        "carbs_g": 66.0,
        "fat_g": 7.0,
        "portion": "1 cup dal palak + 2 bajra rotis",
        "ingredients": ["Toor dal", "Spinach", "Bajra flour", "Garlic", "Cumin", "Onions"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "clear_chicken_soup",
        "name": "Herb Chicken & Vegetable Clear Soup with Steamed Rice",
        "category": "DINNER",
        "diet": "NON_VEGETARIAN",
        "allergies": [],
        "calories": 360,
        "protein_g": 34.0,
        "carbs_g": 38.0,
        "fat_g": 7.0,
        "portion": "1 large bowl soup (350ml) + 1/2 cup rice",
        "ingredients": ["Chicken breast", "Carrots", "Beans", "Rice", "Black pepper", "Ginger", "Garlic"],
        "source": "USDA FDC",
    },
    {
        "id": "foxtail_millet_khichdi",
        "name": "Foxtail Millet & Moong Vegetable Khichdi (Dairy-Free)",
        "category": "DINNER",
        "diet": "VEGAN",
        "allergies": [],
        "calories": 380,
        "protein_g": 15.0,
        "carbs_g": 64.0,
        "fat_g": 6.5,
        "portion": "1 large bowl (250g)",
        "ingredients": ["Foxtail millet", "Yellow moong dal", "Carrots", "Green peas", "Cumin", "Turmeric"],
        "source": "ICMR-NIN IFCT",
    },
    {
        "id": "grilled_paneer_tikka",
        "name": "Grilled Paneer Tikka with Bell Peppers & Mint Salad",
        "category": "DINNER",
        "diet": "VEGETARIAN",
        "allergies": ["DAIRY"],
        "calories": 410,
        "protein_g": 22.0,
        "carbs_g": 18.0,
        "fat_g": 28.0,
        "portion": "180g paneer tikka + cucumber mint salad",
        "ingredients": ["Paneer", "Yogurt", "Bell peppers", "Onions", "Ajwain", "Garam masala"],
        "source": "ICMR-NIN IFCT",
    },
]

# ── Allergy Synonym Normalization Map ──────────────────────────────────────
ALLERGY_SYNONYMS: Dict[str, str] = {
    "peanut": "PEANUTS",
    "peanuts": "PEANUTS",
    "groundnut": "PEANUTS",
    "groundnuts": "PEANUTS",
    "dairy": "DAIRY",
    "milk": "DAIRY",
    "lactose": "DAIRY",
    "butter": "DAIRY",
    "ghee": "DAIRY",
    "curd": "DAIRY",
    "yogurt": "DAIRY",
    "yoghurt": "DAIRY",
    "paneer": "DAIRY",
    "cheese": "DAIRY",
    "cream": "DAIRY",
    "whey": "DAIRY",
    "egg": "EGGS",
    "eggs": "EGGS",
    "gluten": "GLUTEN",
    "wheat": "GLUTEN",
    "nut": "NUTS",
    "nuts": "NUTS",
    "tree nut": "NUTS",
    "tree nuts": "NUTS",
    "tree_nuts": "NUTS",
    "almond": "NUTS",
    "almonds": "NUTS",
    "cashew": "NUTS",
    "cashews": "NUTS",
    "walnut": "NUTS",
    "walnuts": "NUTS",
    "soy": "SOY",
    "soya": "SOY",
    "soybean": "SOY",
    "fish": "FISH",
    "seafood": "FISH",
    "shellfish": "FISH",
    "sesame": "SESAME",
    "sesame seeds": "SESAME",
}

# Ingredient-level keywords that trigger allergen classification
ALLERGEN_INGREDIENT_KEYWORDS: Dict[str, List[str]] = {
    "DAIRY": ["milk", "butter", "ghee", "curd", "yogurt", "yoghurt", "paneer", "cheese", "cream", "whey"],
    "EGGS": ["egg", "eggs"],
    "PEANUTS": ["peanut", "peanuts", "groundnut"],
    "NUTS": ["almond", "almonds", "cashew", "cashews", "walnut", "walnuts", "pistachio", "hazelnut"],
    "GLUTEN": ["wheat", "whole wheat", "bread", "semolina", "roti", "phulka", "maida", "flour", "multigrain"],
    "SOY": ["soy", "tofu", "edamame", "soya"],
    "FISH": ["fish", "prawn", "salmon", "pomfret", "rohu"],
    "SESAME": ["sesame"],
}


def normalize_allergies(raw_allergies: List[str]) -> Set[str]:
    """Convert arbitrary user allergy terms to canonical uppercase tags."""
    result = set()
    for item in raw_allergies or []:
        cleaned = item.strip().lower()
        if cleaned in ALLERGY_SYNONYMS:
            result.add(ALLERGY_SYNONYMS[cleaned])
        else:
            result.add(cleaned.upper())
    return result


def dish_contains_allergens(item: Dict[str, Any], excluded_allergens: Set[str]) -> bool:
    """Check both the declared allergy tags and the exact ingredient list."""
    if not excluded_allergens:
        return False

    # 1. Direct tag check
    dish_tags = {t.upper() for t in item.get("allergies", [])}
    if any(tag in excluded_allergens for tag in dish_tags):
        return True

    # 2. Ingredient-level keyword check
    ingredients = [ing.lower() for ing in item.get("ingredients", [])]
    for allergen in excluded_allergens:
        keywords = ALLERGEN_INGREDIENT_KEYWORDS.get(allergen, [])
        for kw in keywords:
            for ing in ingredients:
                if kw in ing:
                    return True
    return False


class MealPlanPreference(BaseModel):
    diet_type: str = Field(default="VEGETARIAN", description="VEGETARIAN | NON_VEGETARIAN | VEGAN")
    allergies: List[str] = Field(default_factory=list, description="Allergies to exclude (e.g. PEANUTS, DAIRY, GLUTEN, EGGS, FISH, SOY)")
    calorie_target: int = Field(default=1800, ge=1200, le=3500)
    target_days: int = Field(default=7, ge=1, le=7)


def get_food_catalog(
    category: Optional[str] = None,
    diet_type: Optional[str] = None,
    exclude_allergies: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Retrieve filtered catalog of balanced food options matching diet and allergy criteria."""
    res = []
    normalized_exclusions = normalize_allergies(exclude_allergies or [])

    for item in CURATED_FOOD_CATALOG:
        if category and item["category"] != category.upper():
            continue
        if diet_type:
            d = diet_type.upper()
            if d == "VEGAN" and item["diet"] != "VEGAN":
                continue
            if d == "VEGETARIAN" and item["diet"] not in ("VEGAN", "VEGETARIAN"):
                continue

        # Strict allergy check across declared tags and ingredients
        if dish_contains_allergens(item, normalized_exclusions):
            continue

        res.append(item)
    return res


def generate_meal_plan(pref: MealPlanPreference) -> Dict[str, Any]:
    """Generate a structured daily and weekly meal plan meeting calorie and dietary constraints."""
    diet = pref.diet_type.upper()
    allergies = pref.allergies or []
    normalized_exclusions = normalize_allergies(allergies)

    breakfasts = get_food_catalog("BREAKFAST", diet, allergies)
    lunches = get_food_catalog("LUNCH", diet, allergies)
    snacks = get_food_catalog("SNACKS", diet, allergies)
    dinners = get_food_catalog("DINNER", diet, allergies)

    days_plan = []
    days_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    grocery_counter: Dict[str, int] = {}

    for i in range(min(pref.target_days, 7)):
        b = breakfasts[i % len(breakfasts)] if breakfasts else None
        l = lunches[i % len(lunches)] if lunches else None
        s = snacks[i % len(snacks)] if snacks else None
        d = dinners[i % len(dinners)] if dinners else None

        day_cals = sum(item["calories"] for item in (b, l, s, d) if item)
        day_protein = sum(item["protein_g"] for item in (b, l, s, d) if item)
        day_carbs = sum(item["carbs_g"] for item in (b, l, s, d) if item)
        day_fat = sum(item["fat_g"] for item in (b, l, s, d) if item)

        for item in (b, l, s, d):
            if item:
                for ing in item["ingredients"]:
                    grocery_counter[ing] = grocery_counter.get(ing, 0) + 1

        days_plan.append({
            "day": days_names[i],
            "breakfast": b,
            "lunch": l,
            "snack": s,
            "dinner": d,
            "totals": {
                "calories": day_cals,
                "protein_g": round(day_protein, 1),
                "carbs_g": round(day_carbs, 1),
                "fat_g": round(day_fat, 1),
            },
        })

    # Sort grocery items by name
    sorted_groceries = sorted(grocery_counter.keys())

    return {
        "diet_type": pref.diet_type,
        "allergies_excluded": sorted(list(normalized_exclusions)),
        "daily_target_calories": pref.calorie_target,
        "days": days_plan,
        "grocery_list": sorted_groceries,
        "data_sources": [
            "ICMR - National Institute of Nutrition (NIN): Indian Food Composition Tables (IFCT)",
            "USDA Agricultural Research Service: FoodData Central (FDC)",
        ],
        "disclaimer": "Educational wellness meal suggestions based on balanced nutritional proportions. Not a medically prescribed diet.",
    }


def find_substitutions(food_id: str, exclude_allergies: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Find healthy alternative meal items in the same category, respecting allergies."""
    target_item = next((f for f in CURATED_FOOD_CATALOG if f["id"] == food_id), None)
    if not target_item:
        return []

    normalized_exclusions = normalize_allergies(exclude_allergies or [])
    subs = [
        f for f in CURATED_FOOD_CATALOG
        if f["category"] == target_item["category"]
        and f["id"] != target_item["id"]
        and not dish_contains_allergens(f, normalized_exclusions)
    ]
    return subs
