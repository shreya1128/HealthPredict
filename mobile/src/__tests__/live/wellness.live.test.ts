/**
 * OPT-IN: the mobile wellness + reports layer against the REAL backend (see auth.live.test.ts for how to run).
 * Includes fetching a real PDF through the same function the Reports screen uses.
 * NOTE: runs in Node, so axios returns a Buffer for `arraybuffer`; React Native's XHR returns an ArrayBuffer.
 * That difference is NOT covered here (needs a device).
 */
import { authApi } from '@/api/auth';
import { dashboardApi } from '@/api/dashboard';
import { ApiError } from '@/api/errors';
import { profileApi } from '@/api/profile';
import { reportsApi } from '@/api/reports';
import { trackingApi } from '@/api/tracking';
import { bytesToBase64 } from '@/utils/base64';
import { localDateIso } from '@/utils/trackingForm';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(k, v),
    deleteItemAsync: async (k: string) => void store.delete(k),
  };
});

const live = process.env.HP_LIVE === '1' ? describe : describe.skip;
const EMAIL = `well.live.${Date.now()}@example.com`;
const PASSWORD = 'Str0ng!Pass1';
const TODAY = localDateIso();

live('mobile wellness + reports layer against the real backend', () => {
  jest.setTimeout(60_000);
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    await authApi.register({ email: EMAIL, password: PASSWORD, confirm_password: PASSWORD, full_name: 'Well Live', gender: 'FEMALE' });
    await authApi.login(EMAIL, PASSWORD);
  });

  it('a new user has empty logs and honest zero/null summaries', async () => {
    expect(await trackingApi.exercises(30)).toEqual([]);
    expect(await trackingApi.sleeps(30)).toEqual([]);
    expect(await trackingApi.hydration(7)).toEqual([]);
    expect(await trackingApi.nutrition(7)).toEqual([]);
    expect(await trackingApi.goals()).toEqual([]);
    expect((await trackingApi.exerciseWeekly(7)).total_minutes).toBe(0);
    expect((await trackingApi.sleepWeekly(7)).average_duration_hours).toBeNull();
    const water = await trackingApi.hydrationDaily();
    expect(water.total_ml).toBe(0);
    const meals = await trackingApi.nutritionDaily();
    expect(meals.entries).toEqual([]);
    expect(meals.total_calories).toBe(0);
  });

  it('exercise: saves, returns numbers (not strings), and the weekly summary reflects it', async () => {
    const e = await trackingApi.createExercise({ exercise_type: 'Walking', exercise_date: TODAY, duration_minutes: 30, intensity: 'MODERATE', calories_burned: 120, distance_km: 2.5, notes: 'evening' });
    ids.exercise = e.id;
    expect(e.distance_km).toBe(2.5);
    expect(typeof e.distance_km).toBe('number');
    expect((await trackingApi.exercises(30)).map((x) => x.id)).toEqual([e.id]);
    const week = await trackingApi.exerciseWeekly(7);
    expect(week.total_minutes).toBe(30);
    expect(week.total_calories).toBe(120);
  });

  it('sleep: the backend calculates duration from bedtime and wake time (overnight)', async () => {
    const s = await trackingApi.createSleep({ sleep_date: TODAY, bedtime: '22:30', wake_time: '06:30', sleep_quality: 7 });
    ids.sleep = s.id;
    expect(s.sleep_duration_hours).toBe(8);
    expect(typeof s.sleep_duration_hours).toBe('number');
    expect(s.sleep_quality).toBe(7);
    const week = await trackingApi.sleepWeekly(7);
    expect(week.average_duration_hours).toBe(8);
  });

  it('hydration: total, then the daily target comes from the profile (set through the same API the editor uses)', async () => {
    const a = await trackingApi.createHydration({ hydration_date: TODAY, water_intake_ml: 250 });
    const b = await trackingApi.createHydration({ hydration_date: TODAY, water_intake_ml: 500, notes: 'bottle' });
    ids.water = a.id;
    ids.water2 = b.id;
    await profileApi.update({ water_intake_goal_ml: 3000 });
    const daily = await trackingApi.hydrationDaily();
    expect(daily.total_ml).toBe(750);
    expect(daily.goal_ml).toBe(3000);
    expect(daily.percent_of_goal).toBeCloseTo(25, 1);
    expect(typeof daily.percent_of_goal).toBe('number');
  });

  it('the profile editor\'s water-goal limits match the backend (500 to 10000)', async () => {
    for (const bad of [100, 20000]) {
      const err = await profileApi.update({ water_intake_goal_ml: bad }).then(() => null, (e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).kind).toBe('validation');
    }
    expect((await profileApi.update({ water_intake_goal_ml: 500 })).water_intake_goal_ml).toBe(500);
    expect((await profileApi.update({ water_intake_goal_ml: 10000 })).water_intake_goal_ml).toBe(10000);
    await profileApi.update({ water_intake_goal_ml: 3000 });
  });

  it('nutrition: calories are optional and never invented; the daily total only counts recorded calories', async () => {
    const b = await trackingApi.createNutrition({ nutrition_date: TODAY, meal_type: 'BREAKFAST', food_item: 'Oats', calories: 300 });
    const l = await trackingApi.createNutrition({ nutrition_date: TODAY, meal_type: 'LUNCH', food_item: 'Dal rice' });
    ids.meal = b.id;
    ids.meal2 = l.id;
    expect(l.calories).toBeNull();
    const daily = await trackingApi.nutritionDaily();
    expect(daily.total_calories).toBe(300);
    expect(daily.entries).toHaveLength(2);
    expect([...daily.meals_logged].sort()).toEqual(['BREAKFAST', 'LUNCH']);
  });

  it('goals: server-calculated progress, status changes, and "Other" goals have no progress', async () => {
    const g = await trackingApi.createGoal({ goal_type: 'EXERCISE', goal_description: 'Move more', target_value: 150, unit: 'minutes/week', start_date: TODAY });
    ids.goal = g.id;
    const listed = (await trackingApi.goals()).find((x) => x.id === g.id)!;
    expect(typeof listed.target_value).toBe('number');
    expect(listed.percentage_complete).toBeCloseTo(20, 0); // 30 of 150 minutes logged above
    expect(listed.status).toBe('ACTIVE');

    expect((await trackingApi.updateGoal(g.id, { status: 'PAUSED' })).status).toBe('PAUSED');
    expect((await trackingApi.updateGoal(g.id, { status: 'ACTIVE' })).status).toBe('ACTIVE');

    const other = await trackingApi.createGoal({ goal_type: 'OTHER', goal_description: 'Be kind', target_value: 1, start_date: TODAY });
    const o = (await trackingApi.goals()).find((x) => x.id === other.id)!;
    expect(o.percentage_complete).toBeNull();
    await trackingApi.deleteGoal(other.id);

    const done = await trackingApi.updateGoal(g.id, { status: 'COMPLETED' });
    expect(done.status).toBe('COMPLETED');
  });

  it('the Home dashboard reports the same wellness numbers as the Track tab', async () => {
    const d = await dashboardApi.get();
    expect(d.exercise_this_week.total_minutes).toBe(30);
    expect(d.hydration_today.total_ml).toBe(750);
    expect(d.sleep_this_week.average_duration_hours).toBe(8);
  });

  it('the backend rejects bad entries with readable validation errors', async () => {
    // Handlers are attached immediately: a rejection that is only awaited later is briefly "unhandled" and fails flakily under load.
    const settle = (p: Promise<unknown>) => p.then(() => null, (e) => e);
    const results = await Promise.all([
      settle(trackingApi.createExercise({ exercise_type: 'Run', exercise_date: TODAY, duration_minutes: 0, intensity: 'LOW' })),
      settle(trackingApi.createHydration({ hydration_date: TODAY, water_intake_ml: 99999 })),
      settle(trackingApi.createSleep({ sleep_date: TODAY, bedtime: '22:30' })),
    ]);
    for (const err of results) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).kind).toBe('validation');
      expect((err as ApiError).message.length).toBeGreaterThan(0);
    }
  });

  it('weekly report: numbers are normalised, reflect the logged data, and carry no invented recommendations', async () => {
    const r = await reportsApi.weekly();
    expect(r.week_start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.total_exercise_minutes).toBe(30);
    expect(r.average_sleep_duration).toBe(8);
    expect(typeof r.average_hydration_ml).toBe('number');
    expect(Array.isArray(r.recommendations)).toBe(true);
    expect(Array.isArray(r.significant_changes)).toBe(true);
    expect(r.weight_change_kg).toBeNull(); // no weights recorded: "No data", not 0
  });

  it('history contains this week\'s stored report, and its PDF downloads as real PDF bytes via the screen\'s own function', async () => {
    const report = await reportsApi.weekly();
    const history = await reportsApi.history();
    const row = history.find((h) => h.week_start_date === report.week_start_date);
    expect(row).toBeDefined();
    const bytes = await reportsApi.pdf(row!.id);
    const view = new Uint8Array(bytes as ArrayBuffer);
    expect(Buffer.from(view.slice(0, 5)).toString('latin1')).toBe('%PDF-');
    expect(view.length).toBeGreaterThan(1000);
    // the exact string that would be written to disk decodes back to the same bytes
    const b64 = bytesToBase64(view);
    expect(Buffer.from(b64, 'base64').equals(Buffer.from(view))).toBe(true);
  });

  it('a missing report is a clean not_found (an arraybuffer error body must not break error mapping)', async () => {
    const err = await reportsApi.pdf(99999999).then(() => null, (e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).kind).toBe('not_found');
    expect((err as ApiError).message).not.toMatch(/object|undefined/i);
  });

  it('deleting entries removes them and the summaries follow', async () => {
    await trackingApi.deleteExercise(ids.exercise);
    await trackingApi.deleteSleep(ids.sleep);
    await trackingApi.deleteHydration(ids.water);
    await trackingApi.deleteHydration(ids.water2);
    await trackingApi.deleteNutrition(ids.meal);
    await trackingApi.deleteNutrition(ids.meal2);
    expect(await trackingApi.exercises(30)).toEqual([]);
    expect((await trackingApi.hydrationDaily()).total_ml).toBe(0);
    expect((await trackingApi.nutritionDaily()).entries).toEqual([]);
    expect((await trackingApi.exerciseWeekly(7)).total_minutes).toBe(0);
    await trackingApi.deleteGoal(ids.goal);
    expect(await trackingApi.goals()).toEqual([]);
  });
});
