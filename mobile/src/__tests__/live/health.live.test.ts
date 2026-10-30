/**
 * OPT-IN: checks the mobile health layer (types + normalisation) against REAL backend payloads, including a real
 * ML prediction. Same setup as auth.live.test.ts (HP_LIVE=1, EXPO_PUBLIC_API_BASE_URL, RATE_LIMIT_ENABLED=false).
 */
import { api } from '@/api/client';
import { authApi } from '@/api/auth';
import { dashboardApi } from '@/api/dashboard';
import { ApiError } from '@/api/errors';
import { healthApi } from '@/api/health';
import { profileApi } from '@/api/profile';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(k, v),
    deleteItemAsync: async (k: string) => void store.delete(k),
  };
});

const live = process.env.HP_LIVE === '1' ? describe : describe.skip;
const EMAIL = `health.live.${Date.now()}@example.com`;
const PASSWORD = 'Str0ng!Pass1';
const CATEGORIES = ['LOW', 'MODERATE', 'HIGH'];

live('mobile health layer against the real backend', () => {
  jest.setTimeout(40_000);
  let predictedId = 0;

  beforeAll(async () => {
    await authApi.register({ email: EMAIL, password: PASSWORD, confirm_password: PASSWORD, full_name: 'Health Live', gender: 'FEMALE', date_of_birth: '1975-05-05' });
    await authApi.login(EMAIL, PASSWORD);
  });

  it('a brand-new user has no latest assessment: the 404 becomes null, not an error', async () => {
    expect(await healthApi.latest()).toBeNull();
  });

  it('a brand-new dashboard parses and contains nothing invented', async () => {
    const d = await dashboardApi.get();
    expect(d.latest_assessment).toBeNull();
    expect(d.today_medicines).toEqual([]);
    expect(d.active_goals).toEqual([]);
    expect(d.insights).toEqual([]);
    expect(d.hydration_today.total_ml).toBe(0);
    expect(typeof d.hydration_today.date).toBe('string'); // serialised as "date", not "date_"
    expect(d.exercise_this_week.total_minutes).toBe(0);
    expect(d.sleep_this_week.average_duration_hours).toBeNull();
  });

  it('assessment without profile data: a real score + breakdown, and an honest list of what the AI estimate still needs', async () => {
    const a = await healthApi.createAssessment({ systolic_bp: 128, diastolic_bp: 82, heart_rate_bpm: 71 });
    expect(typeof a.health_score).toBe('number');
    expect(CATEGORIES).toContain(a.risk_category);
    expect(typeof a.data_completeness_percent).toBe('number');
    expect(a.score_breakdown!.components.length).toBeGreaterThan(0);
    for (const c of a.score_breakdown!.components) {
      expect(typeof c.score).toBe('number');
      expect(typeof c.weight_pct).toBe('number');
    }
    expect(a.ml_prediction).toBeNull();
    expect(a.ml_prediction_missing_fields.length).toBeGreaterThan(0);
    expect(a.ml_prediction_missing_fields.join(' ')).toMatch(/height and weight|cholesterol|glucose/i);
    expect(a.systolic_bp).toBe(128);
    expect(a.spo2_percent).toBeNull();
  });

  it('records what the raw JSON actually looks like for decimals (documenting the contract)', async () => {
    const { data } = await api.get('/health/assessment/latest');
    console.info(`raw health_score type: ${typeof data.health_score}; raw data_completeness_percent type: ${typeof data.data_completeness_percent}`);
    expect(['number', 'string']).toContain(typeof data.health_score);
  });

  it('profile update returns the server-calculated BMI as a number', async () => {
    const p = await profileApi.update({
      height_cm: 165, weight_kg: 68.5, exercise_frequency: 'LIGHT', smoking_status: 'NEVER',
      alcohol_consumption: 'OCCASIONALLY', cholesterol_level: 'NORMAL', sleep_duration_hours: 7,
    });
    expect(p.bmi).toBeCloseTo(68.5 / 1.65 ** 2, 0);
    expect(p.height_cm).toBe(165);
    expect(p.smoking_status).toBe('NEVER');
    expect((await profileApi.get()).weight_kg).toBe(68.5);
  });

  it('with a complete profile + glucose, the REAL model returns a prediction with factors and a plain-language explanation', async () => {
    const a = await healthApi.createAssessment({ systolic_bp: 142, diastolic_bp: 90, heart_rate_bpm: 76, blood_glucose_mg_dl: 104 });
    predictedId = a.id;
    expect(a.ml_prediction_missing_fields).toEqual([]);
    const p = a.ml_prediction!;
    expect(p).not.toBeNull();
    expect(p.probability).toBeGreaterThan(0);
    expect(p.probability).toBeLessThan(1);
    expect(CATEGORIES).toContain(p.risk_level);
    expect(typeof p.confidence_percent).toBe('number');
    expect(p.top_factors.length).toBeGreaterThan(0);
    for (const f of p.top_factors) {
      expect(['increases', 'decreases']).toContain(f.direction);
      expect(f.relative_strength).toBeGreaterThan(0);
      expect(f.relative_strength).toBeLessThanOrEqual(100);
      expect(f.label.length).toBeGreaterThan(0);
    }
    expect(p.explanation_text.length).toBeGreaterThan(20);
    expect(p.disclaimer).toMatch(/not|diagnos/i);
    expect(typeof p.model_version).toBe('string');
  });

  it('the stored prediction is returned unchanged by latest(), get(id) and the dashboard (never re-computed or invented)', async () => {
    const latest = await healthApi.latest();
    expect(latest!.id).toBe(predictedId);
    const again = await healthApi.get(predictedId);
    expect(again.ml_prediction).toEqual(latest!.ml_prediction);
    const d = await dashboardApi.get();
    expect(d.latest_assessment!.ml_prediction!.probability).toBe(latest!.ml_prediction!.probability);
  });


  it('lists assessments newest-first with numeric scores, and history has one point per day', async () => {
    const page = await healthApi.list(1, 20);
    expect(page.total).toBeGreaterThanOrEqual(2);
    expect(page.items[0].id).toBe(predictedId);
    expect(typeof page.items[0].health_score).toBe('number');
    const h = await healthApi.history(30);
    expect(h.points.length).toBe(1); // two assessments today -> the day's row is overwritten, not duplicated
    expect(typeof h.points[0].health_score).toBe('number');
    expect(typeof h.points[0].bmi).toBe('number');
    expect(h.points[0].systolic_bp).toBe(142);
  });

  it('server-side validation errors arrive as readable ApiErrors', async () => {
    const empty = await healthApi.createAssessment({}).then(() => null, (e) => e);
    expect(empty).toBeInstanceOf(ApiError);
    expect((empty as ApiError).kind).toBe('validation');
    const lonely = await healthApi.createAssessment({ systolic_bp: 120, heart_rate_bpm: 70 }).then(() => null, (e) => e);
    expect((lonely as ApiError).message).toMatch(/blood pressure|systolic|diastolic/i);
    const badProfile = await profileApi.update({ height_cm: 20 }).then(() => null, (e) => e);
    expect((badProfile as ApiError).kind).toBe('validation');
  });

  it("gender 'Other' makes the backend say so instead of guessing a prediction", async () => {
    await profileApi.update({ gender: 'OTHER' });
    const a = await healthApi.createAssessment({ systolic_bp: 120, diastolic_bp: 80, blood_glucose_mg_dl: 90 });
    expect(a.ml_prediction).toBeNull();
    expect(a.ml_prediction_missing_fields.join(' ')).toMatch(/male or female/i);
    await profileApi.update({ gender: 'FEMALE' });
  });
});
