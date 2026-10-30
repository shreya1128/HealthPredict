import type {
  AlcoholConsumption, CholesterolLevel, ExerciseFrequency, Gender, HealthProfile, ProfileUpdate, SmokingStatus,
} from '@/api/types';

import { parseNumber } from './assessment';
import { validateDateOfBirth } from './validation';

export interface ProfileForm {
  dob: string;
  gender: Gender | null;
  timezone: string;
  height: string;
  weight: string;
  waist: string;
  sleep: string;
  waterGoal: string;
  exercise: ExerciseFrequency | null;
  smoking: SmokingStatus | null;
  alcohol: AlcoholConsumption | null;
  cholesterol: CholesterolLevel | null;
}
export type ProfileErrors = Partial<Record<keyof ProfileForm, string>>;

const show = (n: number | null) => (n === null ? '' : String(n));

export function formFromProfile(p: HealthProfile): ProfileForm {
  return {
    dob: p.user.date_of_birth ?? '',
    gender: p.user.gender,
    timezone: p.user.timezone ?? 'UTC',
    height: show(p.height_cm),
    weight: show(p.weight_kg),
    waist: show(p.waist_circumference_cm),
    sleep: show(p.sleep_duration_hours),
    waterGoal: show(p.water_intake_goal_ml),
    exercise: p.exercise_frequency,
    smoking: p.smoking_status,
    alcohol: p.alcohol_consumption,
    cholesterol: p.cholesterol_level,
  };
}

const NUMERIC = [
  { form: 'height', api: 'height_cm', label: 'Height', min: 50, max: 250 },
  { form: 'weight', api: 'weight_kg', label: 'Weight', min: 20, max: 400 },
  { form: 'waist', api: 'waist_circumference_cm', label: 'Waist', min: 30, max: 250 },
  { form: 'sleep', api: 'sleep_duration_hours', label: 'Sleep', min: 0, max: 24 },
  { form: 'waterGoal', api: 'water_intake_goal_ml', label: 'Water goal', min: 500, max: 10000, integer: true },
] as const;

/**
 * Builds a PARTIAL update containing only fields the user actually changed (the backend applies exactly the
 * keys it receives). Blank fields are left alone rather than cleared.
 */
export function buildProfileChanges(original: HealthProfile, form: ProfileForm): { changes: ProfileUpdate; errors: ProfileErrors } {
  const before = formFromProfile(original);
  const errors: ProfileErrors = {};
  const changes: Record<string, unknown> = {};

  for (const f of NUMERIC) {
    const text = form[f.form].trim();
    if (!text || text === before[f.form]) continue;
    const n = parseNumber(text);
    if (Number.isNaN(n)) errors[f.form] = 'Enter a number';
    else if (n < f.min || n > f.max) errors[f.form] = `${f.label} should be between ${f.min} and ${f.max}`;
    else if ('integer' in f && f.integer && !Number.isInteger(n)) errors[f.form] = 'Use a whole number';
    else if (!/^\d+(\.\d{1,2})?$/.test(text.replace(',', '.'))) errors[f.form] = 'At most 2 decimal places';
    else changes[f.api] = n;
  }

  const dob = form.dob.trim();
  if (dob && dob !== before.dob) {
    const err = validateDateOfBirth(dob);
    if (err) errors.dob = err;
    else changes.date_of_birth = dob;
  }

  const tz = form.timezone.trim();
  if (tz && tz !== before.timezone) {
    changes.timezone = tz;
  }

  const choices = [
    ['gender', 'gender'], ['exercise', 'exercise_frequency'], ['smoking', 'smoking_status'],
    ['alcohol', 'alcohol_consumption'], ['cholesterol', 'cholesterol_level'],
  ] as const;
  for (const [formKey, apiKey] of choices) {
    if (form[formKey] && form[formKey] !== before[formKey]) changes[apiKey] = form[formKey];
  }

  return { changes: changes as ProfileUpdate, errors };
}
