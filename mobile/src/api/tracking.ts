import { coerce, toNum } from '@/utils/num';

import { api } from './client';
import type {
  ExerciseCreate, ExerciseLog, ExerciseWeek, Goal, GoalStatus, GoalType, HydrationCreate, HydrationDaily,
  HydrationLog, MealType, NutritionCreate, NutritionDaily, NutritionLog, SleepCreate, SleepLog, SleepWeek,
} from './types';

const exerciseNumbers = ['duration_minutes', 'calories_burned', 'distance_km'] as const;
const sleepNumbers = ['sleep_duration_hours', 'sleep_quality'] as const;
const goalNumbers = ['target_value', 'current_value', 'percentage_complete'] as const;
const normalizeGoal = (goal: Goal): Goal => coerce(goal, goalNumbers);

export const trackingApi = {
  async exercises(days = 30): Promise<ExerciseLog[]> {
    const { data } = await api.get<ExerciseLog[]>('/exercise', { params: { days } });
    return data.map((row) => coerce(row, exerciseNumbers));
  },
  async exerciseWeekly(days = 7): Promise<ExerciseWeek> {
    const { data } = await api.get<ExerciseWeek>('/exercise/weekly', { params: { days } });
    return data;
  },
  async createExercise(payload: ExerciseCreate): Promise<ExerciseLog> {
    const { data } = await api.post<ExerciseLog>('/exercise', payload);
    return coerce(data, exerciseNumbers);
  },
  async deleteExercise(id: number): Promise<void> { await api.delete(`/exercise/${id}`); },

  async sleeps(days = 30): Promise<SleepLog[]> {
    const { data } = await api.get<SleepLog[]>('/sleep', { params: { days } });
    return data.map((row) => coerce(row, sleepNumbers));
  },
  async sleepWeekly(days = 7): Promise<SleepWeek> {
    const { data } = await api.get<SleepWeek>('/sleep/weekly', { params: { days } });
    return { ...data, average_duration_hours: toNum(data.average_duration_hours), average_quality: toNum(data.average_quality) };
  },
  async createSleep(payload: SleepCreate): Promise<SleepLog> {
    const { data } = await api.post<SleepLog>('/sleep', payload);
    return coerce(data, sleepNumbers);
  },
  async deleteSleep(id: number): Promise<void> { await api.delete(`/sleep/${id}`); },

  async hydration(days = 7): Promise<HydrationLog[]> {
    const { data } = await api.get<HydrationLog[]>('/hydration', { params: { days } });
    return data;
  },
  async hydrationDaily(): Promise<HydrationDaily> {
    const { data } = await api.get<HydrationDaily>('/hydration/daily');
    return { ...data, percent_of_goal: toNum(data.percent_of_goal) };
  },
  async createHydration(payload: HydrationCreate): Promise<HydrationLog> {
    const { data } = await api.post<HydrationLog>('/hydration', payload);
    return data;
  },
  async deleteHydration(id: number): Promise<void> { await api.delete(`/hydration/${id}`); },

  async nutrition(days = 7): Promise<NutritionLog[]> {
    const { data } = await api.get<NutritionLog[]>('/nutrition', { params: { days } });
    return data;
  },
  async nutritionDaily(): Promise<NutritionDaily> {
    const { data } = await api.get<NutritionDaily>('/nutrition/daily');
    return data;
  },
  async createNutrition(payload: NutritionCreate): Promise<NutritionLog> {
    const { data } = await api.post<NutritionLog>('/nutrition', payload);
    return data;
  },
  async deleteNutrition(id: number): Promise<void> { await api.delete(`/nutrition/${id}`); },

  async goals(status?: GoalStatus): Promise<Goal[]> {
    const { data } = await api.get<Goal[]>('/goals', { params: status ? { status } : undefined });
    return data.map(normalizeGoal);
  },
  async createGoal(payload: { goal_type: GoalType; goal_description?: string; target_value: number; unit?: string; start_date: string; end_date?: string }): Promise<Goal> {
    const { data } = await api.post<Goal>('/goals', payload);
    return normalizeGoal(data);
  },
  async updateGoal(id: number, payload: { status?: GoalStatus; goal_description?: string; target_value?: number; unit?: string; end_date?: string | null }): Promise<Goal> {
    const { data } = await api.put<Goal>(`/goals/${id}`, payload);
    return normalizeGoal(data);
  },
  async deleteGoal(id: number): Promise<void> { await api.delete(`/goals/${id}`); },
};

export const TRACKING_OPTIONS = {
  intensities: [
    { value: 'LOW', label: 'Low' }, { value: 'MODERATE', label: 'Moderate' }, { value: 'HIGH', label: 'High' },
  ] as const,
  meals: [
    { value: 'BREAKFAST', label: 'Breakfast' }, { value: 'LUNCH', label: 'Lunch' },
    { value: 'DINNER', label: 'Dinner' }, { value: 'SNACK', label: 'Snack' },
  ] as const,
  goalTypes: [
    { value: 'EXERCISE', label: 'Exercise' }, { value: 'SLEEP', label: 'Sleep' },
    { value: 'HYDRATION', label: 'Hydration' }, { value: 'WEIGHT', label: 'Weight' },
    { value: 'MEDICINE_ADHERENCE', label: 'Medicine adherence' }, { value: 'OTHER', label: 'Other' },
  ] as const,
};

export type { GoalStatus, GoalType, MealType };
