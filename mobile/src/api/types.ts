/** Mirrors backend/app/schemas/auth.py. Keep in sync with the API, never re-implement its rules here. */
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type Role = 'USER' | 'ADMIN';

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  date_of_birth: string | null; // YYYY-MM-DD
  gender: Gender | null;
  role: Role;
  is_active: boolean;
  email_verified: boolean;
  timezone?: string;
  created_at: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  /** Seconds until the access token expires. */
  expires_in: number;
  user: User;
}

export interface RegisterPayload {
  email: string;
  password: string;
  confirm_password: string;
  full_name: string;
  phone?: string | null;
  date_of_birth?: string | null;
  gender: Gender;
  timezone?: string;
}

export interface MessageResponse {
  message: string;
}

// ---------------------------------------------------------------------------
// Health (mirrors backend/app/schemas/health.py, profile.py, dashboard.py)
// ---------------------------------------------------------------------------
/** Rule-based category from the backend. Unknown strings are tolerated by the UI. */
export type RiskCategory = 'LOW' | 'MODERATE' | 'HIGH';

export interface AssessmentCreate {
  systolic_bp?: number;
  diastolic_bp?: number;
  heart_rate_bpm?: number;
  blood_glucose_mg_dl?: number;
  spo2_percent?: number;
  temperature_celsius?: number;
  assessment_notes?: string;
}

export interface ScoreComponent {
  key: string;
  label: string;
  score: number;
  weight_pct: number;
}
export interface SkippedComponent {
  key: string;
  label: string;
  reason: string;
}
export interface ScoreBreakdown {
  components: ScoreComponent[];
  skipped: SkippedComponent[];
}

export interface PredictionFactor {
  key: string;
  label: string;
  /** "increases" | "decreases": the effect on the model's estimated risk. */
  direction: string;
  relative_strength: number;
  shap_value_log_odds: number;
}
export interface MLPrediction {
  probability: number;
  risk_level: string;
  confidence_percent: number;
  model_version: string;
  top_factors: PredictionFactor[];
  explanation_text: string;
  disclaimer: string;
}

export interface Assessment {
  id: number;
  assessment_date: string; // YYYY-MM-DD
  systolic_bp: number | null;
  diastolic_bp: number | null;
  heart_rate_bpm: number | null;
  blood_glucose_mg_dl: number | null;
  spo2_percent: number | null;
  temperature_celsius: number | null;
  health_score: number | null;
  risk_category: string;
  data_completeness_percent: number | null;
  assessment_notes: string | null;
  status: string;
  created_at: string | null;
  score_breakdown: ScoreBreakdown | null;
  disclaimer: string;
  glucose_caveat: string | null;
  profile_hints: string[];
  ml_prediction: MLPrediction | null;
  ml_prediction_missing_fields: string[];
}

export interface AssessmentSummary {
  id: number;
  assessment_date: string;
  health_score: number | null;
  risk_category: string;
  data_completeness_percent: number | null;
  created_at: string | null;
}
export interface AssessmentPage {
  items: AssessmentSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface HistoryPoint {
  tracking_date: string;
  health_score: number | null;
  bmi: number | null;
  weight_kg: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  heart_rate_bpm: number | null;
  blood_glucose_mg_dl: number | null;
  spo2_percent: number | null;
  risk_category: string;
}
export interface HistoryResponse {
  days: number;
  points: HistoryPoint[];
}

export type ExerciseFrequency = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';
export type SmokingStatus = 'NEVER' | 'FORMER' | 'CURRENT';
export type AlcoholConsumption = 'NEVER' | 'OCCASIONALLY' | 'REGULARLY' | 'HEAVILY';
export type CholesterolLevel = 'NORMAL' | 'ABOVE_NORMAL' | 'WELL_ABOVE_NORMAL';

export interface HealthProfile {
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  waist_circumference_cm: number | null;
  blood_type: string | null;
  exercise_frequency: ExerciseFrequency | null;
  sleep_duration_hours: number | null;
  smoking_status: SmokingStatus | null;
  alcohol_consumption: AlcoholConsumption | null;
  cholesterol_level: CholesterolLevel | null;
  diet_type: string | null;
  water_intake_goal_ml: number | null;
  user: User;
}

/** Partial update: only the keys present are changed on the server. */
export interface ProfileUpdate {
  date_of_birth?: string;
  gender?: Gender;
  timezone?: string;
  height_cm?: number;
  weight_kg?: number;
  waist_circumference_cm?: number;
  exercise_frequency?: ExerciseFrequency;
  sleep_duration_hours?: number;
  water_intake_goal_ml?: number;
  smoking_status?: SmokingStatus;
  alcohol_consumption?: AlcoholConsumption;
  cholesterol_level?: CholesterolLevel;
}

export interface ScheduleEntry {
  id: number;
  medicine_id: number;
  medicine_name: string | null;
  scheduled_date: string;
  scheduled_time: string | null; // HH:MM:SS
  is_taken: boolean;
  is_skipped: boolean;
  taken_at: string | null;
  skipped_reason: string | null;
}
export interface HydrationToday {
  date: string;
  total_ml: number;
  goal_ml: number | null;
  percent_of_goal: number | null;
}
export interface ExerciseWeek {
  days: number;
  total_minutes: number;
  total_calories: number;
  by_day: Record<string, number>;
}
export interface SleepWeek {
  days: number;
  average_duration_hours: number | null;
  average_quality: number | null;
  by_day: Record<string, number | null>;
}
export interface Goal {
  id: number;
  goal_type: string;
  goal_description: string | null;
  target_value: number | null;
  unit: string | null;
  start_date: string;
  end_date: string | null;
  is_achieved: boolean;
  status: string;
  current_value: number | null;
  percentage_complete: number | null;
  progress_note: string | null;
}
export interface Insight {
  metric: string;
  direction: string;
  message: string;
}
export interface Dashboard {
  latest_assessment: Assessment | null;
  today_medicines: ScheduleEntry[];
  hydration_today: HydrationToday;
  exercise_this_week: ExerciseWeek;
  sleep_this_week: SleepWeek;
  active_goals: Goal[];
  insights: Insight[];
}

// ---------------------------------------------------------------------------
// Medicines (mirrors backend/app/schemas/medicine.py)
// ---------------------------------------------------------------------------
export type MedicineFormType = 'TABLET' | 'CAPSULE' | 'LIQUID' | 'INJECTION' | 'PATCH' | 'OTHER';
export type FrequencyUnit = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'AS_NEEDED';

export interface Medicine {
  id: number;
  medicine_name: string;
  dosage: number | null;
  dosage_unit: string | null;
  form: MedicineFormType;
  frequency_unit: FrequencyUnit;
  time_of_day: string[]; // "HH:MM", 24-hour
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
  instructions: string | null;
  reason_for_use: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string | null;
}

export interface MedicineCreate {
  medicine_name: string;
  dosage?: number;
  dosage_unit?: string;
  form: MedicineFormType;
  frequency_unit: FrequencyUnit;
  time_of_day: string[];
  start_date: string;
  end_date?: string;
  instructions?: string;
  reason_for_use?: string;
  notes?: string;
}

/** Partial update (the backend rejects unknown keys, and start_date cannot be changed). `null` clears a field. */
export interface MedicineUpdate {
  medicine_name?: string;
  dosage?: number | null;
  dosage_unit?: string | null;
  form?: MedicineFormType;
  frequency_unit?: FrequencyUnit;
  time_of_day?: string[];
  end_date?: string | null;
  instructions?: string | null;
  reason_for_use?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export interface Adherence {
  days: number;
  scheduled_count: number;
  taken_count: number;
  skipped_count: number;
  missed_count: number;
  /** Per-medicine: 0 when nothing scheduled. Overall: null when nothing scheduled (nothing to measure). */
  adherence_percent: number | null;
}

// ---------------------------------------------------------------------------
// Wellness tracking and weekly reports (mirrors backend schemas/tracking.py and dashboard.py)
// ---------------------------------------------------------------------------
export type ExerciseIntensity = 'LOW' | 'MODERATE' | 'HIGH';
export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
export type GoalType = 'EXERCISE' | 'SLEEP' | 'HYDRATION' | 'WEIGHT' | 'MEDICINE_ADHERENCE' | 'OTHER';
export type GoalStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED';

export interface ExerciseLog {
  id: number;
  exercise_date: string;
  exercise_type: string;
  duration_minutes: number | null;
  intensity: ExerciseIntensity;
  calories_burned: number | null;
  distance_km: number | null;
  notes: string | null;
  created_at: string | null;
}
export interface ExerciseCreate {
  exercise_type: string;
  exercise_date: string;
  duration_minutes?: number;
  intensity: ExerciseIntensity;
  calories_burned?: number;
  distance_km?: number;
  notes?: string;
}
export interface SleepLog {
  id: number;
  sleep_date: string;
  bedtime: string | null;
  wake_time: string | null;
  sleep_duration_hours: number | null;
  sleep_quality: number | null;
  notes: string | null;
  created_at: string | null;
}
export interface SleepCreate {
  sleep_date: string;
  bedtime?: string;
  wake_time?: string;
  sleep_quality?: number;
  notes?: string;
}
export interface HydrationLog {
  id: number;
  hydration_date: string;
  water_intake_ml: number;
  entry_time: string | null;
  notes: string | null;
  created_at: string | null;
}
export interface HydrationCreate {
  hydration_date: string;
  water_intake_ml: number;
  entry_time?: string;
  notes?: string;
}
export interface HydrationDaily {
  date: string;
  total_ml: number;
  goal_ml: number | null;
  percent_of_goal: number | null;
}

export interface NutritionLog {
  id: number;
  nutrition_date: string;
  meal_type: MealType;
  food_item: string | null;
  calories: number | null;
  portion_size: string | null;
  notes: string | null;
  created_at: string | null;
}
export interface NutritionCreate {
  nutrition_date: string;
  meal_type: MealType;
  food_item?: string;
  calories?: number;
  portion_size?: string;
  notes?: string;
}
export interface NutritionDaily {
  date: string;
  total_calories: number;
  meals_logged: MealType[];
  entries: NutritionLog[];
}

export interface WeeklyReport {
  week_start_date: string;
  week_end_date: string;
  average_health_score: number | null;
  weight_change_kg: number | null;
  total_exercise_minutes: number | null;
  average_sleep_duration: number | null;
  average_hydration_ml: number | null;
  medicine_adherence_percent: number | null;
  goals_progress_percent: number | null;
  significant_changes: Insight[];
  recommendations: string[];
}
export interface WeeklyReportSummary {
  id: number;
  week_start_date: string;
  week_end_date: string;
  average_health_score: number | null;
  medicine_adherence_percent: number | null;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// In-app notifications (mirrors backend/app/schemas/notification.py)
// ---------------------------------------------------------------------------
export interface AppNotification {
  id: number;
  notification_type: string; // MISSED_MEDICINE | ASSESSMENT_COMPLETED | WEEKLY_REPORT | GOAL_PROGRESS | WELLNESS_REMINDER | ...
  title: string;
  message: string | null;
  is_read: boolean;
  read_at: string | null;
  related_entity_type: string | null;
  related_entity_id: number | null;
  action_url: string | null;
  created_at: string | null;
}
export interface NotificationPage {
  items: AppNotification[];
  total: number;
  unread: number;
  page: number;
  page_size: number;
}
