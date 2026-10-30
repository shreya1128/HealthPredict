import { api } from './client';

export interface MealPlanDay {
  day: string;
  breakfast?: any;
  lunch?: any;
  snack?: any;
  dinner?: any;
  totals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
}

export interface MealPlanResponse {
  diet_type: string;
  allergies_excluded: string[];
  daily_target_calories: number;
  days: MealPlanDay[];
  grocery_list: string[];
  data_sources: string[];
  disclaimer: string;
}

export interface MealPlanRequest {
  diet_type: string;
  allergies: string[];
  calorie_target: number;
  target_days: number;
}

export const nutritionPlanApi = {
  async getCatalog(category?: string, dietType?: string, allergies?: string[]): Promise<any[]> {
    const params: any = {};
    if (category) params.category = category;
    if (dietType) params.diet_type = dietType;
    if (allergies && allergies.length > 0) params.allergies = allergies;
    const { data } = await api.get('/nutrition/catalog', { params });
    return data;
  },
  async generateMealPlan(preferences: MealPlanRequest): Promise<MealPlanResponse> {
    const { data } = await api.post<MealPlanResponse>('/nutrition/meal-plan', preferences);
    return data;
  },
  async getSubstitutions(foodId: string): Promise<any[]> {
    const { data } = await api.get(`/nutrition/substitutions/${foodId}`);
    return data;
  },
};
