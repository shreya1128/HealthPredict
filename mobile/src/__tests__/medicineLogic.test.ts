import type { Medicine } from '@/api/types';
import { doseDate, medicineIdFromNotification, planReminders, reminderText, MAX_REMINDERS } from '@/notifications/reminderPlan';
import { dosageText, doseStatus, groupByDate, scheduleText } from '@/utils/medicineDisplay';
import {
  buildCreatePayload, buildUpdateChanges, emptyMedicineForm, formatTimeInput, formFromMedicine, isValidTime, mapServerErrors,
  todayIso, type MedicineFormState,
} from '@/utils/medicineForm';
import { dayOffset, entry, MED_AS_NEEDED, MED_DAILY, MED_PAUSED } from '@/test-utils/fixtures';

const NOW = new Date(2026, 9, 7, 12, 0, 0); // Wed 7 Oct 2026, 12:00
const form = (over: Partial<MedicineFormState> = {}): MedicineFormState => ({ ...emptyMedicineForm(NOW), name: 'Metformin', ...over });

describe('time helpers', () => {
  it('formats typed digits as HH:MM', () => {
    expect(formatTimeInput('0830')).toBe('08:30');
    expect(formatTimeInput('8')).toBe('8');
    expect(formatTimeInput('083055')).toBe('08:30');
    expect(formatTimeInput('ab12')).toBe('12');
  });
  it('validates 24-hour times', () => {
    expect(['00:00', '08:05', '23:59'].every(isValidTime)).toBe(true);
    expect(['24:00', '8:00', '12:60', '', '12:3'].some(isValidTime)).toBe(false);
  });
  it('todayIso is zero-padded and local', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('buildCreatePayload', () => {
  it('maps a full form to the API payload', () => {
    const { payload, errors } = buildCreatePayload(
      form({ dosage: '500', unit: ' mg ', times: ['20:00', '08:00'], endDate: '2026-12-31', reason: 'Sugar', instructions: 'With food', notes: 'n' }),
    );
    expect(errors).toEqual({});
    expect(payload).toEqual({
      medicine_name: 'Metformin', dosage: 500, dosage_unit: 'mg', form: 'TABLET', frequency_unit: 'DAILY',
      time_of_day: ['08:00', '20:00'], start_date: '2026-10-07', end_date: '2026-12-31',
      reason_for_use: 'Sugar', instructions: 'With food', notes: 'n',
    });
  });
  it('omits blank optional fields', () => {
    expect(buildCreatePayload(form()).payload).toEqual({
      medicine_name: 'Metformin', form: 'TABLET', frequency_unit: 'DAILY', time_of_day: ['08:00'], start_date: '2026-10-07',
    });
  });
  it('as-needed medicines never send times', () => {
    expect(buildCreatePayload(form({ frequency: 'AS_NEEDED', times: ['08:00'] })).payload?.time_of_day).toEqual([]);
  });
  it.each([
    [{ name: '  ' }, 'name'],
    [{ dosage: '-3' }, 'dosage'],
    [{ dosage: '1.234' }, 'dosage'],
    [{ dosage: '200000' }, 'dosage'],
    [{ times: [] }, 'times'],
    [{ times: ['25:00'] }, 'times'],
    [{ times: ['08:00', '08:00'] }, 'times'],
    [{ frequency: 'WEEKLY', times: ['08:00', '20:00'] }, 'times'],
    [{ frequency: 'MONTHLY', times: ['08:00', '20:00'] }, 'times'],
    [{ startDate: '' }, 'startDate'],
    [{ startDate: '2026-02-30' }, 'startDate'],
    [{ endDate: '2026-10-01' }, 'endDate'],
    [{ endDate: '2026-13-01' }, 'endDate'],
  ] as const)('rejects %j', (over, field) => {
    const r = buildCreatePayload(form(over as Partial<MedicineFormState>));
    expect(r.payload).toBeNull();
    expect(r.errors[field]).toBeTruthy();
  });
  it('allows up to 10 daily times but not 11', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`);
    expect(buildCreatePayload(form({ times: ten })).payload).not.toBeNull();
    expect(buildCreatePayload(form({ times: [...ten, '17:00'] })).errors.times).toMatch(/10/);
  });
});

describe('buildUpdateChanges', () => {
  const original = MED_DAILY;
  it('sends nothing when nothing changed', () => {
    const r = buildUpdateChanges(original, formFromMedicine(original));
    expect(r.changes).toEqual({});
    expect(r.schedulesRebuilt).toBe(false);
  });
  it('sends only changed fields, never start_date', () => {
    const r = buildUpdateChanges(original, { ...formFromMedicine(original), dosage: '250', instructions: 'After food' });
    expect(r.changes).toEqual({ dosage: 250, instructions: 'After food' });
    expect(r.schedulesRebuilt).toBe(false);
    expect(r.changes).not.toHaveProperty('start_date');
  });
  it('flags a schedule rebuild when times, frequency or end date change', () => {
    expect(buildUpdateChanges(original, { ...formFromMedicine(original), times: ['09:00', '21:00'] })).toMatchObject({ changes: { time_of_day: ['09:00', '21:00'] }, schedulesRebuilt: true });
    expect(buildUpdateChanges(original, { ...formFromMedicine(original), endDate: '2026-12-01' }).changes).toEqual({ end_date: '2026-12-01' });
    const weekly = buildUpdateChanges(original, { ...formFromMedicine(original), frequency: 'WEEKLY', times: ['08:00'] });
    expect(weekly.changes).toEqual({ frequency_unit: 'WEEKLY', time_of_day: ['08:00'] });
  });
  it('clearing an optional field sends null so it really clears', () => {
    const r = buildUpdateChanges({ ...original, end_date: '2026-12-01' }, { ...formFromMedicine({ ...original, end_date: '2026-12-01' }), endDate: '', dosage: '', reason: '' });
    expect(r.changes).toEqual({ end_date: null, dosage: null, reason_for_use: null });
  });
  it('switching to as-needed clears the times', () => {
    expect(buildUpdateChanges(original, { ...formFromMedicine(original), frequency: 'AS_NEEDED', times: [] }).changes).toEqual({ frequency_unit: 'AS_NEEDED', time_of_day: [] });
  });
  it('validates before producing changes', () => {
    const r = buildUpdateChanges(original, { ...formFromMedicine(original), name: '' });
    expect(r.errors.name).toBeTruthy();
    expect(r.changes).toEqual({});
  });
});

describe('mapServerErrors', () => {
  it('places backend field messages next to inputs, otherwise falls back to a banner', () => {
    expect(mapServerErrors({ time_of_day: 'bad time', medicine_name: 'required' }, 'x')).toEqual({ errors: { times: 'bad time', name: 'required' }, banner: null });
    expect(mapServerErrors({}, 'Server said no')).toEqual({ errors: {}, banner: 'Server said no' });
  });
});

describe('display helpers', () => {
  it('describes schedules the way the backend generates them', () => {
    expect(scheduleText(MED_DAILY)).toBe('Daily at 08:00, 20:00');
    expect(scheduleText({ frequency_unit: 'WEEKLY', time_of_day: ['09:30'], start_date: '2026-10-07' })).toBe('Weekly on Wednesdays at 09:30');
    expect(scheduleText({ frequency_unit: 'MONTHLY', time_of_day: ['09:30'], start_date: '2026-10-07' })).toBe('Every 30 days at 09:30');
    expect(scheduleText(MED_AS_NEEDED)).toBe('As needed');
  });
  it('formats dosage', () => {
    expect(dosageText(MED_DAILY)).toBe('500 mg');
    expect(dosageText({ dosage: null, dosage_unit: null })).toBe('');
    expect(dosageText({ dosage: 2.5, dosage_unit: null })).toBe('2.5');
  });
  it('classifies doses with the backend definition of missed', () => {
    const today = todayIso(NOW);
    expect(doseStatus(entry({ id: 1, is_taken: true }), today)).toBe('taken');
    expect(doseStatus(entry({ id: 1, is_skipped: true }), today)).toBe('skipped');
    expect(doseStatus(entry({ id: 1, scheduled_date: '2026-10-06' }), today)).toBe('missed');
    expect(doseStatus(entry({ id: 1, scheduled_date: today }), today)).toBe('pending');
    expect(doseStatus(entry({ id: 1, scheduled_date: '2026-10-08' }), today)).toBe('upcoming');
    expect(doseStatus(entry({ id: 1, scheduled_date: '2026-10-06', is_taken: true }), today)).toBe('taken');
  });
  it('groups entries by date in order', () => {
    const g = groupByDate([entry({ id: 1, scheduled_date: '2026-10-08' }), entry({ id: 2, scheduled_date: '2026-10-07' }), entry({ id: 3, scheduled_date: '2026-10-08' })]);
    expect(g.map((x) => [x.date, x.entries.length])).toEqual([['2026-10-07', 1], ['2026-10-08', 2]]);
  });
});

describe('planReminders', () => {
  const med = (over: Partial<Medicine> = {}): Medicine => ({ ...MED_DAILY, ...over });
  const at = (days: number, time: string, over: Partial<Parameters<typeof entry>[0]> = {}, id = 0) =>
    entry({ id: id || Math.floor(Math.random() * 1e6), scheduled_date: dayOffset(days, NOW), scheduled_time: time, ...over });

  it('schedules only pending, future doses of active medicines inside the horizon', () => {
    const plan = planReminders(
      [
        {
          medicine: med(),
          entries: [
            at(0, '08:00:00', {}, 1), // already past (now is 12:00)
            at(0, '20:00:00', {}, 2), // later today -> yes
            at(0, '21:00:00', { is_taken: true }, 3), // already taken
            at(1, '08:00:00', { is_skipped: true }, 4), // skipped
            at(1, '20:00:00', {}, 5), // tomorrow -> yes
            at(15, '08:00:00', {}, 6), // beyond 14 days
            at(2, null as unknown as string, {}, 7), // no time
          ],
        },
        { medicine: med({ id: 9, is_active: false }), entries: [at(1, '09:00:00', { medicine_id: 9 }, 8)] }, // paused
      ],
      NOW,
    );
    expect(plan.map((r) => r.scheduleId)).toEqual([2, 5]);
    expect(plan[0].when).toEqual(new Date(2026, 9, 7, 20, 0));
  });

  it('orders by time across medicines and caps at the limit, keeping the nearest', () => {
    const entries = Array.from({ length: 80 }, (_, i) => at(1, `${String(Math.floor(i / 4) + 1).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00`, {}, i + 1));
    const plan = planReminders([{ medicine: med(), entries }], NOW);
    expect(plan).toHaveLength(MAX_REMINDERS);
    const times = plan.map((r) => r.when.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(plan[0].scheduleId).toBe(1);
    expect(planReminders([{ medicine: med(), entries }], NOW, { max: 5 })).toHaveLength(5);
  });

  it('builds readable content without inventing anything', () => {
    expect(reminderText(MED_DAILY)).toEqual({ title: 'Time for Metformin', body: '500 mg · Take with food' });
    expect(reminderText(MED_PAUSED).body).toBe('1000 IU');
    expect(reminderText({ ...MED_PAUSED, dosage: null, dosage_unit: null }).body).toMatch(/log this dose/i);
  });

  it('turns schedule rows into local times', () => {
    expect(doseDate({ scheduled_date: '2026-10-07', scheduled_time: '08:30:00' })).toEqual(new Date(2026, 9, 7, 8, 30));
    expect(doseDate({ scheduled_date: '2026-10-07', scheduled_time: null })).toBeNull();
  });
});

describe('medicineIdFromNotification', () => {
  const resp = (data: unknown) => ({ notification: { request: { content: { data: data as Record<string, unknown> } } } });
  it('only accepts our own reminders', () => {
    expect(medicineIdFromNotification(resp({ kind: 'medicine-reminder', medicineId: 5 }))).toBe(5);
    expect(medicineIdFromNotification(resp({ kind: 'medicine-reminder', medicineId: '7' }))).toBe(7);
    expect(medicineIdFromNotification(resp({ kind: 'other', medicineId: 5 }))).toBeNull();
    expect(medicineIdFromNotification(resp({ kind: 'medicine-reminder', medicineId: 'abc' }))).toBeNull();
    expect(medicineIdFromNotification(resp(null))).toBeNull();
  });
});
