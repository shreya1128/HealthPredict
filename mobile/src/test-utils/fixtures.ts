import type { Adherence, Assessment, Dashboard, HealthProfile, Medicine, ScheduleEntry, User } from '@/api/types';
import { todayIso } from '@/utils/medicineForm';

export const USER: User = {
  id: 7, email: 'asha@example.com', full_name: 'Asha Rao', phone: null, date_of_birth: '1990-03-15',
  gender: 'FEMALE', role: 'USER', is_active: true, email_verified: false, created_at: '2026-01-10T08:00:00Z',
};

export const ASSESSMENT: Assessment = {
  id: 5, assessment_date: '2026-10-07', systolic_bp: 128, diastolic_bp: 82, heart_rate_bpm: 71,
  blood_glucose_mg_dl: null, spo2_percent: null, temperature_celsius: null,
  health_score: 72.5, risk_category: 'MODERATE', data_completeness_percent: 64, assessment_notes: 'Felt fine',
  status: 'COMPLETED', created_at: '2026-10-07T09:00:00Z',
  score_breakdown: {
    components: [
      { key: 'vitals', label: 'Vital signs', score: 80, weight_pct: 40 },
      { key: 'bmi', label: 'Body weight', score: 60, weight_pct: 25 },
    ],
    skipped: [{ key: 'sleep', label: 'Sleep', reason: 'no sleep duration in your profile' }],
  },
  disclaimer: 'Educational use only.', glucose_caveat: null, profile_hints: [],
  ml_prediction: {
    probability: 0.54, risk_level: 'MODERATE', confidence_percent: 8, model_version: 'gb-v1',
    top_factors: [
      { key: 'age', label: 'Age', direction: 'increases', relative_strength: 100, shap_value_log_odds: 0.5 },
      { key: 'activity', label: 'Physical activity', direction: 'decreases', relative_strength: 40, shap_value_log_odds: -0.2 },
    ],
    explanation_text: 'Your age and blood pressure raised the estimate most.', disclaimer: 'Not a diagnosis.',
  },
  ml_prediction_missing_fields: [],
};

export const ASSESSMENT_NEEDS_PROFILE: Assessment = {
  ...ASSESSMENT, id: 6, ml_prediction: null,
  ml_prediction_missing_fields: ['height and weight in your profile', 'cholesterol level in your profile'],
};

export const EMPTY_DASHBOARD: Dashboard = {
  latest_assessment: null, today_medicines: [],
  hydration_today: { date: '2026-10-07', total_ml: 0, goal_ml: null, percent_of_goal: null },
  exercise_this_week: { days: 7, total_minutes: 0, total_calories: 0, by_day: {} },
  sleep_this_week: { days: 7, average_duration_hours: null, average_quality: null, by_day: {} },
  active_goals: [], insights: [],
};

export const FULL_DASHBOARD: Dashboard = {
  ...EMPTY_DASHBOARD,
  latest_assessment: ASSESSMENT,
  today_medicines: [
    { id: 1, medicine_id: 1, medicine_name: 'Metformin', scheduled_date: '2026-10-07', scheduled_time: '08:00:00', is_taken: true, is_skipped: false, taken_at: null, skipped_reason: null },
    { id: 2, medicine_id: 2, medicine_name: 'Vitamin D', scheduled_date: '2026-10-07', scheduled_time: '20:30:00', is_taken: false, is_skipped: false, taken_at: null, skipped_reason: null },
  ],
  hydration_today: { date: '2026-10-07', total_ml: 1200, goal_ml: 2400, percent_of_goal: 50 },
  exercise_this_week: { days: 7, total_minutes: 150, total_calories: 900, by_day: {} },
  sleep_this_week: { days: 7, average_duration_hours: 7.25, average_quality: 7, by_day: {} },
  active_goals: [{
    id: 1, goal_type: 'WEIGHT', goal_description: 'Lose 3 kg', target_value: 3, unit: 'kg', start_date: '2026-09-01', end_date: null,
    is_achieved: false, status: 'ACTIVE', current_value: 1.5, percentage_complete: 50, progress_note: null,
  }],
  insights: [{ metric: 'sleep', direction: 'up', message: 'You slept more this week than last week.' }],
};

export const PROFILE: HealthProfile = {
  height_cm: 170, weight_kg: 68, bmi: 23.5, waist_circumference_cm: null, blood_type: null,
  exercise_frequency: 'LIGHT', sleep_duration_hours: 7, smoking_status: null, alcohol_consumption: null,
  cholesterol_level: null, diet_type: null, water_intake_goal_ml: null, user: USER,
};

// ---- Medicines -------------------------------------------------------------
export const dayOffset = (days: number, base = new Date()): string => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return todayIso(d);
};

export const MED_DAILY: Medicine = {
  id: 3, medicine_name: 'Metformin', dosage: 500, dosage_unit: 'mg', form: 'TABLET', frequency_unit: 'DAILY',
  time_of_day: ['08:00', '20:00'], start_date: '2026-09-01', end_date: null, instructions: 'Take with food',
  reason_for_use: 'Blood sugar', notes: null, is_active: true, created_at: null,
};
export const MED_PAUSED: Medicine = { ...MED_DAILY, id: 4, medicine_name: 'Vitamin D', dosage: 1000, dosage_unit: 'IU', is_active: false, instructions: null, reason_for_use: null };
export const MED_AS_NEEDED: Medicine = { ...MED_DAILY, id: 5, medicine_name: 'Ibuprofen', frequency_unit: 'AS_NEEDED', time_of_day: [], instructions: null, reason_for_use: null };

export const entry = (over: Partial<ScheduleEntry> & { id: number }): ScheduleEntry => ({
  medicine_id: 3, medicine_name: 'Metformin', scheduled_date: todayIso(), scheduled_time: '08:00:00',
  is_taken: false, is_skipped: false, taken_at: null, skipped_reason: null, ...over,
});

export const ADHERENCE_OVERALL: Adherence = { days: 30, scheduled_count: 12, taken_count: 9, skipped_count: 1, missed_count: 2, adherence_percent: 75 };
export const ADHERENCE_NONE: Adherence = { days: 30, scheduled_count: 0, taken_count: 0, skipped_count: 0, missed_count: 0, adherence_percent: null };
