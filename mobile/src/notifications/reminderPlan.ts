import type { Medicine, ScheduleEntry } from '@/api/types';
import { dosageText } from '@/utils/medicineDisplay';

/** iOS keeps at most 64 pending local notifications, so we schedule the nearest 60 and top up on every sync. */
export const MAX_REMINDERS = 60;
export const HORIZON_DAYS = 14;
export const REMINDER_KIND = 'medicine-reminder';

export interface Reminder {
  medicineId: number;
  scheduleId: number;
  when: Date;
  title: string;
  body: string;
}

/** "2026-10-07" + "08:30:00" -> local Date. Schedule times are the user's local wall-clock times. */
export function doseDate(entry: Pick<ScheduleEntry, 'scheduled_date' | 'scheduled_time'>): Date | null {
  if (!entry.scheduled_time) return null;
  const [y, mo, d] = entry.scheduled_date.split('-').map(Number);
  const [h, mi] = entry.scheduled_time.split(':').map(Number);
  if ([y, mo, d, h, mi].some((n) => !Number.isFinite(n))) return null;
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

export function reminderText(m: Pick<Medicine, 'medicine_name' | 'dosage' | 'dosage_unit' | 'instructions'>): { title: string; body: string } {
  const dose = dosageText(m);
  const parts = [dose, m.instructions?.trim()].filter(Boolean);
  return { title: `Time for ${m.medicine_name}`, body: parts.length ? parts.join(' · ') : 'Open HealthPredict to log this dose.' };
}

/**
 * Chooses which reminders to schedule. Pure, so it is fully unit-testable.
 *  - only ACTIVE medicines, and only doses that are still pending (not taken, not skipped)
 *  - only future times inside the horizon
 *  - nearest first, capped at `max`
 */
export function planReminders(
  items: { medicine: Medicine; entries: ScheduleEntry[] }[],
  now: Date,
  options: { max?: number; horizonDays?: number } = {},
): Reminder[] {
  const max = options.max ?? MAX_REMINDERS;
  const limit = new Date(now.getTime() + (options.horizonDays ?? HORIZON_DAYS) * 86_400_000);
  const out: Reminder[] = [];
  for (const { medicine, entries } of items) {
    if (!medicine.is_active) continue;
    const text = reminderText(medicine);
    for (const e of entries) {
      if (e.is_taken || e.is_skipped) continue;
      const when = doseDate(e);
      if (!when || when.getTime() <= now.getTime() || when.getTime() > limit.getTime()) continue;
      out.push({ medicineId: medicine.id, scheduleId: e.id, when, ...text });
    }
  }
  return out.sort((a, b) => a.when.getTime() - b.when.getTime() || a.scheduleId - b.scheduleId).slice(0, max);
}

/** Extracts the medicine to open from a tapped notification, or null if it isn't one of ours. */
export function medicineIdFromNotification(response: { notification: { request: { content: { data?: Record<string, unknown> | null } } } }): number | null {
  const data = response.notification.request.content.data;
  if (!data || data.kind !== REMINDER_KIND) return null;
  const id = Number(data.medicineId);
  return Number.isInteger(id) && id > 0 ? id : null;
}
