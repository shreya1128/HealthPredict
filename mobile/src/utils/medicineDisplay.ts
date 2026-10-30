import type { Medicine, ScheduleEntry } from '@/api/types';

import { formatTime } from './health';
import { todayIso } from './medicineForm';

const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export const FORM_LABELS: Record<string, string> = { TABLET: 'Tablet', CAPSULE: 'Capsule', LIQUID: 'Liquid', INJECTION: 'Injection', PATCH: 'Patch', OTHER: 'Other' };
export const FREQUENCY_LABELS: Record<string, string> = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Every 30 days', AS_NEEDED: 'As needed' };

export function dosageText(m: Pick<Medicine, 'dosage' | 'dosage_unit'>): string {
  if (m.dosage === null) return m.dosage_unit ?? '';
  return `${m.dosage}${m.dosage_unit ? ` ${m.dosage_unit}` : ''}`;
}

/** Human description of the schedule, matching how the backend generates it (weekly = start date's weekday; monthly = every 30 days). */
export function scheduleText(m: Pick<Medicine, 'frequency_unit' | 'time_of_day' | 'start_date'>): string {
  const times = m.time_of_day.map(formatTime).join(', ');
  switch (m.frequency_unit) {
    case 'DAILY':
      return `Daily at ${times}`;
    case 'WEEKLY': {
      const [y, mo, d] = m.start_date.split('-').map(Number);
      return `Weekly on ${WEEKDAYS[new Date(y, mo - 1, d).getDay()]} at ${times}`;
    }
    case 'MONTHLY':
      return `Every 30 days at ${times}`;
    default:
      return 'As needed';
  }
}

export type DoseStatus = 'taken' | 'skipped' | 'missed' | 'pending' | 'upcoming';

/** Same definition of "missed" as the backend: past-due and neither taken nor skipped. */
export function doseStatus(e: Pick<ScheduleEntry, 'is_taken' | 'is_skipped' | 'scheduled_date'>, today = todayIso()): DoseStatus {
  if (e.is_taken) return 'taken';
  if (e.is_skipped) return 'skipped';
  if (e.scheduled_date < today) return 'missed';
  if (e.scheduled_date > today) return 'upcoming';
  return 'pending';
}

export const DOSE_STATUS_LABEL: Record<DoseStatus, string> = { taken: 'Taken', skipped: 'Skipped', missed: 'Missed', pending: 'Pending', upcoming: 'Upcoming' };

export function groupByDate(entries: ScheduleEntry[]): { date: string; entries: ScheduleEntry[] }[] {
  const map = new Map<string, ScheduleEntry[]>();
  for (const e of entries) map.set(e.scheduled_date, [...(map.get(e.scheduled_date) ?? []), e]);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, entries: list }));
}
