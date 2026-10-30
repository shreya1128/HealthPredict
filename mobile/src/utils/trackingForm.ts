import type { ExerciseCreate, ExerciseIntensity, GoalType, HydrationCreate, MealType, NutritionCreate, SleepCreate } from '@/api/types';

export type FormResult<T> = { payload: T; error: null } | { payload: null; error: string };
const numberValue = (raw: string): number | null => raw.trim() === '' ? null : Number(raw);
const validNumber = (n: number | null, min: number, max: number) => n !== null && Number.isFinite(n) && n >= min && n <= max;
const validInteger = (n: number | null, min: number, max: number) => validNumber(n, min, max) && Number.isInteger(n);

export function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function localDateIso(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildExercisePayload(input: {
  exercise_type: string; duration_minutes: string; intensity: ExerciseIntensity; calories_burned: string;
  distance_km: string; exercise_date: string; notes: string;
}): FormResult<ExerciseCreate> {
  const type = input.exercise_type.trim();
  if (!type) return { payload: null, error: 'Enter an activity type.' };
  const duration = numberValue(input.duration_minutes);
  if (input.duration_minutes.trim() && !validInteger(duration, 1, 1440)) return { payload: null, error: 'Duration must be between 1 and 1440 minutes.' };
  const calories = numberValue(input.calories_burned);
  if (input.calories_burned.trim() && !validInteger(calories, 0, 10000)) return { payload: null, error: 'Calories must be between 0 and 10000.' };
  const distance = numberValue(input.distance_km);
  if (input.distance_km.trim() && (!validNumber(distance, 0, 1000) || !/^\d+(?:\.\d{1,2})?$/.test(input.distance_km.trim()))) return { payload: null, error: 'Distance must be between 0 and 1000 km, with at most 2 decimal places.' };
  if (!isIsoCalendarDate(input.exercise_date)) return { payload: null, error: 'Enter a real calendar date in YYYY-MM-DD format.' };
  return { payload: {
    exercise_type: type, exercise_date: input.exercise_date,
    ...(duration !== null ? { duration_minutes: duration } : {}), intensity: input.intensity,
    ...(calories !== null ? { calories_burned: calories } : {}), ...(distance !== null ? { distance_km: distance } : {}),
    ...(input.notes.trim() ? { notes: input.notes.trim() } : {}),
  }, error: null };
}

export function buildSleepPayload(input: {
  sleep_date: string; bedtime: string; wake_time: string; sleep_quality: string; notes: string;
}): FormResult<SleepCreate> {
  if (!isIsoCalendarDate(input.sleep_date)) return { payload: null, error: 'Enter a real calendar date in YYYY-MM-DD format.' };
  const bedtime = input.bedtime.trim(); const wake = input.wake_time.trim();
  if (!!bedtime !== !!wake) return { payload: null, error: 'Enter both bedtime and wake time, or leave both blank.' };
  const validTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  if ((bedtime && !validTime(bedtime)) || (wake && !validTime(wake))) return { payload: null, error: 'Use 24-hour time, HH:MM.' };
  const quality = numberValue(input.sleep_quality);
  if (input.sleep_quality.trim() && !validInteger(quality, 1, 10)) return { payload: null, error: 'Sleep quality must be between 1 and 10.' };
  return { payload: {
    sleep_date: input.sleep_date, ...(bedtime ? { bedtime, wake_time: wake } : {}),
    ...(quality !== null ? { sleep_quality: quality } : {}), ...(input.notes.trim() ? { notes: input.notes.trim() } : {}),
  }, error: null };
}

export function buildHydrationPayload(input: { hydration_date: string; water_intake_ml: string; notes: string }): FormResult<HydrationCreate> {
  const amount = numberValue(input.water_intake_ml);
  if (!validInteger(amount, 1, 5000)) return { payload: null, error: 'Water amount must be between 1 and 5000 ml.' };
  if (!isIsoCalendarDate(input.hydration_date)) return { payload: null, error: 'Enter a real calendar date in YYYY-MM-DD format.' };
  return { payload: { hydration_date: input.hydration_date, water_intake_ml: amount as number, ...(input.notes.trim() ? { notes: input.notes.trim() } : {}) }, error: null };
}

export function buildNutritionPayload(input: {
  nutrition_date: string; meal_type: MealType; food_item: string; calories: string; portion_size: string; notes: string;
}): FormResult<NutritionCreate> {
  if (!isIsoCalendarDate(input.nutrition_date)) return { payload: null, error: 'Enter a real calendar date in YYYY-MM-DD format.' };
  const calories = numberValue(input.calories);
  if (input.calories.trim() && !validInteger(calories, 0, 10000)) return { payload: null, error: 'Calories must be between 0 and 10000.' };
  return { payload: {
    nutrition_date: input.nutrition_date, meal_type: input.meal_type,
    ...(input.food_item.trim() ? { food_item: input.food_item.trim() } : {}),
    ...(calories !== null ? { calories } : {}), ...(input.portion_size.trim() ? { portion_size: input.portion_size.trim() } : {}),
    ...(input.notes.trim() ? { notes: input.notes.trim() } : {}),
  }, error: null };
}

export function defaultGoalUnit(type: GoalType): string {
  switch (type) {
    case 'EXERCISE': return 'minutes/week';
    case 'SLEEP': return 'hours/night';
    case 'HYDRATION': return 'ml/day';
    case 'WEIGHT': return 'kg';
    case 'MEDICINE_ADHERENCE': return 'percent';
    default: return '';
  }
}
