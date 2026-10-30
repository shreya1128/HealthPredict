/**
 * OPT-IN: the mobile medicine layer against the REAL backend (see auth.live.test.ts for how to run).
 * Includes the reminder planner fed with the backend's real schedule rows.
 */
import { authApi } from '@/api/auth';
import { dashboardApi } from '@/api/dashboard';
import { ApiError } from '@/api/errors';
import { medicinesApi } from '@/api/medicines';
import type { Medicine } from '@/api/types';
import { HORIZON_DAYS, MAX_REMINDERS, planReminders } from '@/notifications/reminderPlan';
import { dayOffset } from '@/test-utils/fixtures';
import { mapServerErrors, todayIso } from '@/utils/medicineForm';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(k, v),
    deleteItemAsync: async (k: string) => void store.delete(k),
  };
});

const live = process.env.HP_LIVE === '1' ? describe : describe.skip;
const EMAIL = `med.live.${Date.now()}@example.com`;
const PASSWORD = 'Str0ng!Pass1';

live('mobile medicine layer against the real backend', () => {
  jest.setTimeout(40_000);
  let med: Medicine;
  let takenId = 0;

  beforeAll(async () => {
    await authApi.register({ email: EMAIL, password: PASSWORD, confirm_password: PASSWORD, full_name: 'Med Live', gender: 'FEMALE' });
    await authApi.login(EMAIL, PASSWORD);
  });

  it('a new user has no medicines, no doses today, and "nothing to measure" (null, not 0%) for adherence', async () => {
    expect(await medicinesApi.list()).toEqual([]);
    expect(await medicinesApi.today()).toEqual([]);
    const overall = await medicinesApi.overallAdherence(30);
    expect(overall.scheduled_count).toBe(0);
    expect(overall.adherence_percent).toBeNull();
  });

  it('creates a daily medicine starting 2 days ago; decimals arrive as numbers after normalisation', async () => {
    med = await medicinesApi.create({
      medicine_name: 'Metformin', dosage: 500, dosage_unit: 'mg', form: 'TABLET', frequency_unit: 'DAILY',
      time_of_day: ['20:00', '08:00'], start_date: dayOffset(-2), instructions: 'Take with food',
    });
    expect(med.id).toBeGreaterThan(0);
    expect(med.dosage).toBe(500);
    expect(typeof med.dosage).toBe('number');
    expect(med.time_of_day).toEqual(['08:00', '20:00']); // sorted by the server
    expect(med.is_active).toBe(true);
    expect((await medicinesApi.get(med.id)).medicine_name).toBe('Metformin');
    expect((await medicinesApi.list()).map((m) => m.id)).toEqual([med.id]);
  });

  it("today's doses carry the medicine name and HH:MM:SS times", async () => {
    const today = await medicinesApi.today();
    expect(today).toHaveLength(2);
    expect(today.every((e) => e.medicine_name === 'Metformin' && /^\d{2}:\d{2}:\d{2}$/.test(e.scheduled_time!))).toBe(true);
    expect(today.map((e) => e.scheduled_time)).toEqual(['08:00:00', '20:00:00']);
    expect((await dashboardApi.get()).today_medicines).toHaveLength(2); // Home sees the same doses
  });

  it('logging taken / skipped yields adherence computed by the server from real records', async () => {
    const schedule = await medicinesApi.schedule(med.id, 7, 14);
    const past = schedule.filter((e) => e.scheduled_date < todayIso());
    expect(past).toHaveLength(4); // 2 past days x 2 doses
    takenId = past[0].id;
    expect((await medicinesApi.markTaken(med.id, past[0].id)).is_taken).toBe(true);
    const skipped = await medicinesApi.markSkipped(med.id, past[1].id, 'felt unwell');
    expect(skipped.is_skipped).toBe(true);
    expect(skipped.skipped_reason).toBe('felt unwell');

    const a = await medicinesApi.adherence(med.id, 30);
    expect({ scheduled: a.scheduled_count, taken: a.taken_count, skipped: a.skipped_count, missed: a.missed_count }).toEqual({ scheduled: 6, taken: 1, skipped: 1, missed: 2 });
    expect(a.adherence_percent).toBeCloseTo(16.67, 1);
    expect(typeof a.adherence_percent).toBe('number');
  });

  it('the new overall-adherence endpoint agrees with the per-medicine figures', async () => {
    const one = await medicinesApi.adherence(med.id, 30);
    const all = await medicinesApi.overallAdherence(30);
    for (const k of ['days', 'scheduled_count', 'taken_count', 'skipped_count', 'missed_count', 'adherence_percent'] as const) expect(all[k]).toEqual(one[k]);
  });

  it('a logged dose can be switched between taken and skipped (there is no undo)', async () => {
    expect((await medicinesApi.markSkipped(med.id, takenId)).is_taken).toBe(false);
    expect((await medicinesApi.markTaken(med.id, takenId)).is_skipped).toBe(false);
  });

  it('REAL schedule rows feed the reminder planner: only future, pending doses, sorted, within the horizon', async () => {
    const meds = (await medicinesApi.list()).filter((m) => m.is_active);
    const items = await Promise.all(meds.map(async (m) => ({ medicine: m, entries: await medicinesApi.schedule(m.id, 0, HORIZON_DAYS) })));
    const now = new Date();
    const plan = planReminders(items, now);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThanOrEqual(MAX_REMINDERS);
    const limit = now.getTime() + HORIZON_DAYS * 86_400_000;
    for (const r of plan) {
      expect(r.when.getTime()).toBeGreaterThan(now.getTime());
      expect(r.when.getTime()).toBeLessThanOrEqual(limit);
      expect(r.title).toBe('Time for Metformin');
      expect(r.body).toBe('500 mg · Take with food');
    }
    expect(plan.map((r) => r.when.getTime())).toEqual([...plan.map((r) => r.when.getTime())].sort((a, b) => a - b));
    const taken = new Set(items[0].entries.filter((e) => e.is_taken || e.is_skipped).map((e) => e.id));
    expect(plan.some((r) => taken.has(r.scheduleId))).toBe(false);
  });

  it('pausing removes it from today and overall adherence, keeps its own history, and resuming restores it', async () => {
    const paused = await medicinesApi.update(med.id, { is_active: false });
    expect(paused.is_active).toBe(false);
    expect(await medicinesApi.today()).toEqual([]);
    expect((await medicinesApi.overallAdherence(30)).adherence_percent).toBeNull();
    expect((await medicinesApi.adherence(med.id, 30)).scheduled_count).toBe(6); // per-medicine history is untouched
    await medicinesApi.update(med.id, { is_active: true });
    expect(await medicinesApi.today()).toHaveLength(2);
  });

  it('editing the times rebuilds FUTURE doses only; logged history is preserved', async () => {
    const updated = await medicinesApi.update(med.id, { time_of_day: ['07:00', '13:00', '21:00'] });
    expect(updated.time_of_day).toEqual(['07:00', '13:00', '21:00']);
    const after = await medicinesApi.schedule(med.id, 7, 14);
    const future = after.filter((e) => e.scheduled_date > todayIso());
    expect(future.length).toBe(14 * 3);
    expect(after.find((e) => e.id === takenId)?.is_taken).toBe(true); // history kept
  });

  it('an end date shortens the schedule, and null clears it again', async () => {
    const ended = await medicinesApi.update(med.id, { end_date: dayOffset(3) });
    expect(ended.end_date).toBe(dayOffset(3));
    const short = (await medicinesApi.schedule(med.id, 0, 14)).filter((e) => e.scheduled_date > todayIso());
    expect(new Set(short.map((e) => e.scheduled_date)).size).toBe(3);
    const cleared = await medicinesApi.update(med.id, { end_date: null });
    expect(cleared.end_date).toBeNull();
  });

  it('as-needed medicines are accepted but have no scheduled doses', async () => {
    const prn = await medicinesApi.create({ medicine_name: 'Ibuprofen', form: 'TABLET', frequency_unit: 'AS_NEEDED', time_of_day: [], start_date: todayIso() });
    expect(prn.time_of_day).toEqual([]);
    expect(await medicinesApi.schedule(prn.id, 7, 14)).toEqual([]);
    expect((await medicinesApi.today()).some((e) => e.medicine_id === prn.id)).toBe(false);
    await medicinesApi.remove(prn.id);
  });

  it("the backend's real validation errors map onto the right form fields", async () => {
    const bad = await medicinesApi
      .create({ medicine_name: 'X', form: 'TABLET', frequency_unit: 'DAILY', time_of_day: ['8am'], start_date: todayIso() })
      .then(() => null, (e) => e);
    expect(bad).toBeInstanceOf(ApiError);
    expect((bad as ApiError).kind).toBe('validation');
    const mapped = mapServerErrors((bad as ApiError).fieldErrors, (bad as ApiError).message);
    expect(mapped.errors.times).toMatch(/HH:MM/);
    expect(mapped.banner).toBeNull();

    const noTimes = await medicinesApi
      .create({ medicine_name: 'X', form: 'TABLET', frequency_unit: 'DAILY', time_of_day: [], start_date: todayIso() })
      .then(() => null, (e) => e);
    // Model-level rules arrive with an empty field name, so they belong in the banner, not on one input.
    const modelLevel = mapServerErrors((noTimes as ApiError).fieldErrors, (noTimes as ApiError).message);
    expect(modelLevel.errors).toEqual({});
    expect(modelLevel.banner).toMatch(/required unless/i);
  });

  it('delete removes the medicine, and a deleted/unknown id is a clean not_found', async () => {
    await medicinesApi.remove(med.id);
    expect(await medicinesApi.list()).toEqual([]);
    const gone = await medicinesApi.get(med.id).then(() => null, (e) => e);
    expect((gone as ApiError).kind).toBe('not_found');
    expect((await medicinesApi.overallAdherence(30)).adherence_percent).toBeNull();
  });
});
