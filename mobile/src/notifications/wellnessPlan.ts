/**
 * Pure planning for LOCAL wellness reminders (hydration, bedtime). No I/O, so it is fully unit-testable.
 *
 * These are repeating on-device notifications at fixed times. They know nothing about your progress: a hydration
 * reminder still fires if you already reached your goal. They are not sent by a server and need no push credentials.
 */
export const WELLNESS_KIND = 'wellness-reminder';
export type WellnessKind = 'hydration' | 'sleep';

export interface WellnessPrefs {
  hydration: { enabled: boolean; intervalHours: number; startHour: number; endHour: number };
  sleep: { enabled: boolean; hour: number; minute: number };
}

export const INTERVAL_CHOICES = [1, 2, 3, 4, 6] as const;
export const MAX_WELLNESS_REMINDERS = 12;

export const DEFAULT_WELLNESS_PREFS: WellnessPrefs = {
  hydration: { enabled: false, intervalHours: 3, startHour: 9, endHour: 21 },
  sleep: { enabled: false, hour: 22, minute: 0 },
};

export interface WellnessReminder {
  kind: WellnessKind;
  hour: number;
  minute: number;
  title: string;
  body: string;
}

const int = (v: unknown, fallback: number, min: number, max: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

/** Accepts anything (e.g. parsed JSON from storage) and returns safe preferences; invalid fields fall back to defaults. */
export function normalizePrefs(raw: unknown): WellnessPrefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { hydration?: Record<string, unknown>; sleep?: Record<string, unknown> };
  const d = DEFAULT_WELLNESS_PREFS;
  const h = o.hydration ?? {};
  const s = o.sleep ?? {};
  const interval = Number(h.intervalHours);
  return {
    hydration: {
      enabled: h.enabled === true,
      intervalHours: (INTERVAL_CHOICES as readonly number[]).includes(interval) ? interval : d.hydration.intervalHours,
      startHour: int(h.startHour, d.hydration.startHour, 0, 23),
      endHour: int(h.endHour, d.hydration.endHour, 0, 23),
    },
    sleep: { enabled: s.enabled === true, hour: int(s.hour, d.sleep.hour, 0, 23), minute: int(s.minute, d.sleep.minute, 0, 59) },
  };
}

/** Clock times (hours) at which hydration reminders fire: start, start+interval, ... up to and including end. */
export function hydrationHours(startHour: number, endHour: number, intervalHours: number): number[] {
  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h += intervalHours) hours.push(h);
  return hours;
}

export interface WellnessErrors {
  hydration?: string;
  sleep?: string;
}

/** Problems with the CURRENT choices, for the settings screen. Disabled sections are not validated. */
export function validatePrefs(p: WellnessPrefs): WellnessErrors {
  const errors: WellnessErrors = {};
  if (p.hydration.enabled) {
    const { startHour, endHour, intervalHours } = p.hydration;
    if (endHour <= startHour) errors.hydration = 'The last reminder time must be later than the first.';
    else if (hydrationHours(startHour, endHour, intervalHours).length > MAX_WELLNESS_REMINDERS) {
      errors.hydration = `That would be more than ${MAX_WELLNESS_REMINDERS} reminders a day. Choose a longer interval or a shorter window.`;
    }
  }
  return errors;
}

export function planWellnessReminders(prefs: WellnessPrefs): WellnessReminder[] {
  const out: WellnessReminder[] = [];
  if (prefs.hydration.enabled && !validatePrefs(prefs).hydration) {
    for (const hour of hydrationHours(prefs.hydration.startHour, prefs.hydration.endHour, prefs.hydration.intervalHours)) {
      out.push({ kind: 'hydration', hour, minute: 0, title: 'Time for some water', body: 'Have a glass of water and log it in the Track tab.' });
    }
  }
  if (prefs.sleep.enabled) {
    out.push({
      kind: 'sleep', hour: prefs.sleep.hour, minute: prefs.sleep.minute, title: 'Time to wind down',
      body: 'A regular bedtime helps. Log how you slept in the morning.',
    });
  }
  return out.slice(0, MAX_WELLNESS_REMINDERS + 1);
}

export const formatClock = (hour: number, minute = 0) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

/** Which wellness reminder a tapped notification was, or null if it isn't one of ours. */
export function wellnessKindFromNotification(response: { notification: { request: { content: { data?: Record<string, unknown> | null } } } }): WellnessKind | null {
  const data = response.notification.request.content.data;
  if (!data || data.kind !== WELLNESS_KIND) return null;
  return data.wellness === 'hydration' || data.wellness === 'sleep' ? data.wellness : null;
}
