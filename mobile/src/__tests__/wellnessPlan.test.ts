import {
  DEFAULT_WELLNESS_PREFS, MAX_WELLNESS_REMINDERS, formatClock, hydrationHours, normalizePrefs, planWellnessReminders, validatePrefs,
  wellnessKindFromNotification, type WellnessPrefs,
} from '@/notifications/wellnessPlan';

const prefs = (over: { hydration?: Partial<WellnessPrefs['hydration']>; sleep?: Partial<WellnessPrefs['sleep']> } = {}): WellnessPrefs => ({
  hydration: { ...DEFAULT_WELLNESS_PREFS.hydration, ...over.hydration },
  sleep: { ...DEFAULT_WELLNESS_PREFS.sleep, ...over.sleep },
});

describe('hydrationHours', () => {
  it('runs from start to end inclusive at the chosen interval', () => {
    expect(hydrationHours(9, 21, 3)).toEqual([9, 12, 15, 18, 21]);
    expect(hydrationHours(9, 21, 4)).toEqual([9, 13, 17, 21]);
    expect(hydrationHours(8, 9, 3)).toEqual([8]);
    expect(hydrationHours(10, 10, 2)).toEqual([10]);
  });
});

describe('normalizePrefs never lets bad stored data through', () => {
  it('falls back to safe defaults for garbage', () => {
    for (const bad of [undefined, null, 'x', 42, [], {}, { hydration: 'no' }]) expect(normalizePrefs(bad)).toEqual(DEFAULT_WELLNESS_PREFS);
  });
  it('keeps valid values and replaces invalid fields individually', () => {
    expect(normalizePrefs({ hydration: { enabled: true, intervalHours: 4, startHour: 8, endHour: 20 }, sleep: { enabled: true, hour: 23, minute: 30 } })).toEqual(
      prefs({ hydration: { enabled: true, intervalHours: 4, startHour: 8, endHour: 20 }, sleep: { enabled: true, hour: 23, minute: 30 } }),
    );
    const n = normalizePrefs({ hydration: { enabled: true, intervalHours: 5, startHour: 99, endHour: -1 }, sleep: { enabled: 'yes', hour: 24, minute: 60 } });
    expect(n.hydration).toEqual({ enabled: true, intervalHours: 3, startHour: 9, endHour: 21 });
    expect(n.sleep).toEqual({ enabled: false, hour: 22, minute: 0 }); // only a real boolean true enables
  });
});

describe('validatePrefs', () => {
  it('requires the last time to be after the first', () => {
    expect(validatePrefs(prefs({ hydration: { enabled: true, startHour: 12, endHour: 12 } })).hydration).toMatch(/later/);
    expect(validatePrefs(prefs({ hydration: { enabled: true, startHour: 15, endHour: 9 } })).hydration).toMatch(/later/);
  });
  it('rejects a schedule with too many reminders a day', () => {
    expect(validatePrefs(prefs({ hydration: { enabled: true, intervalHours: 1, startHour: 0, endHour: 23 } })).hydration).toMatch(/more than 12/);
    expect(validatePrefs(prefs({ hydration: { enabled: true, intervalHours: 1, startHour: 8, endHour: 19 } })).hydration).toBeUndefined(); // exactly 12
  });
  it('does not complain about a disabled section', () => {
    expect(validatePrefs(prefs({ hydration: { enabled: false, startHour: 15, endHour: 9 } }))).toEqual({});
  });
});

describe('planWellnessReminders', () => {
  it('plans nothing when everything is off', () => {
    expect(planWellnessReminders(DEFAULT_WELLNESS_PREFS)).toEqual([]);
  });
  it('plans hydration at the default hours, on the hour', () => {
    const plan = planWellnessReminders(prefs({ hydration: { enabled: true } }));
    expect(plan.map((r) => [r.hour, r.minute])).toEqual([[9, 0], [12, 0], [15, 0], [18, 0], [21, 0]]);
    expect(plan.every((r) => r.kind === 'hydration' && r.title === 'Time for some water')).toBe(true);
  });
  it('plans one bedtime reminder at the chosen time', () => {
    expect(planWellnessReminders(prefs({ sleep: { enabled: true, hour: 22, minute: 45 } }))).toEqual([
      expect.objectContaining({ kind: 'sleep', hour: 22, minute: 45, title: 'Time to wind down' }),
    ]);
  });
  it('plans both, and an invalid hydration window never produces reminders (bedtime still does)', () => {
    expect(planWellnessReminders(prefs({ hydration: { enabled: true }, sleep: { enabled: true } }))).toHaveLength(6);
    const plan = planWellnessReminders(prefs({ hydration: { enabled: true, startHour: 20, endHour: 8 }, sleep: { enabled: true } }));
    expect(plan.map((r) => r.kind)).toEqual(['sleep']);
  });
  it('never exceeds the cap', () => {
    expect(planWellnessReminders(prefs({ hydration: { enabled: true, intervalHours: 1, startHour: 8, endHour: 19 }, sleep: { enabled: true } })).length).toBeLessThanOrEqual(MAX_WELLNESS_REMINDERS + 1);
  });
  it('makes no health claims in the wording', () => {
    const text = planWellnessReminders(prefs({ hydration: { enabled: true }, sleep: { enabled: true } })).map((r) => r.title + r.body).join(' ').toLowerCase();
    expect(text).not.toMatch(/diagnos|cure|treat|prescri|risk/);
  });
});

describe('helpers', () => {
  it('formats clock times', () => {
    expect(formatClock(9)).toBe('09:00');
    expect(formatClock(22, 5)).toBe('22:05');
  });
  const resp = (data: unknown) => ({ notification: { request: { content: { data: data as Record<string, unknown> } } } });
  it('recognises only our own wellness notifications when tapped', () => {
    expect(wellnessKindFromNotification(resp({ kind: 'wellness-reminder', wellness: 'hydration' }))).toBe('hydration');
    expect(wellnessKindFromNotification(resp({ kind: 'wellness-reminder', wellness: 'sleep' }))).toBe('sleep');
    expect(wellnessKindFromNotification(resp({ kind: 'wellness-reminder', wellness: 'other' }))).toBeNull();
    expect(wellnessKindFromNotification(resp({ kind: 'medicine-reminder', wellness: 'sleep' }))).toBeNull();
    expect(wellnessKindFromNotification(resp(null))).toBeNull();
  });
});
