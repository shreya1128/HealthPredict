import type { FrequencyUnit, Medicine, MedicineCreate, MedicineFormType, MedicineUpdate } from '@/api/types';

import { parseNumber } from './assessment';
import { validateDateOfBirth } from './validation';

/**
 * Form <-> API mapping for medicines. Rules mirror backend/app/schemas/medicine.py and schedule_generator.py
 * only to give instant feedback; the server stays the authority and its messages are shown for anything missed.
 */
export interface MedicineFormState {
  name: string;
  dosage: string;
  unit: string;
  form: MedicineFormType;
  frequency: FrequencyUnit;
  times: string[];
  startDate: string;
  endDate: string;
  reason: string;
  instructions: string;
  notes: string;
}
export type MedicineFormErrors = Partial<Record<'name' | 'dosage' | 'unit' | 'times' | 'startDate' | 'endDate' | 'form', string>>;

export const MAX_DAILY_DOSES = 10;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isValidTime = (t: string) => TIME_RE.test(t);

/** "0830" -> "08:30" as the user types. */
export function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function todayIso(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

export const emptyMedicineForm = (now = new Date()): MedicineFormState => ({
  name: '', dosage: '', unit: '', form: 'TABLET', frequency: 'DAILY', times: ['08:00'],
  startDate: todayIso(now), endDate: '', reason: '', instructions: '', notes: '',
});

export function formFromMedicine(m: Medicine): MedicineFormState {
  return {
    name: m.medicine_name, dosage: m.dosage === null ? '' : String(m.dosage), unit: m.dosage_unit ?? '', form: m.form,
    frequency: m.frequency_unit, times: [...m.time_of_day], startDate: m.start_date, endDate: m.end_date ?? '',
    reason: m.reason_for_use ?? '', instructions: m.instructions ?? '', notes: m.notes ?? '',
  };
}

/** Times a given frequency allows: weekly and monthly doses are a single time (the backend uses only the first). */
export const timesAllowed = (f: FrequencyUnit) => (f === 'AS_NEEDED' ? 0 : f === 'DAILY' ? MAX_DAILY_DOSES : 1);

function validate(form: MedicineFormState, mode: 'create' | 'edit'): MedicineFormErrors {
  const errors: MedicineFormErrors = {};
  if (!form.name.trim()) errors.name = 'Enter the medicine name';
  else if (form.name.trim().length > 255) errors.name = 'Name is too long';

  const dosage = form.dosage.trim();
  if (dosage) {
    const n = parseNumber(dosage);
    if (Number.isNaN(n) || n <= 0) errors.dosage = 'Enter a positive number';
    else if (n > 100000) errors.dosage = 'Dosage is too large';
    else if (!/^\d+(\.\d{1,2})?$/.test(dosage.replace(',', '.'))) errors.dosage = 'At most 2 decimal places';
  }
  if (form.unit.trim().length > 50) errors.unit = 'Unit is too long';

  const times = form.times;
  if (form.frequency === 'AS_NEEDED') {
    // times are ignored (cleared on submit)
  } else if (times.length === 0) errors.times = 'Add at least one time';
  else if (times.some((t) => !isValidTime(t))) errors.times = 'Use 24-hour times like 08:00 or 20:30';
  else if (new Set(times).size !== times.length) errors.times = 'Each time can only be listed once';
  else if (times.length > timesAllowed(form.frequency)) {
    errors.times = form.frequency === 'DAILY' ? `Up to ${MAX_DAILY_DOSES} doses a day` : 'Weekly and monthly medicines have one dose time';
  }

  if (mode === 'create') {
    const startErr = validateDateOfBirth(form.startDate.trim() || '', new Date(9999, 0, 1)); // format/real-date check only
    if (!form.startDate.trim()) errors.startDate = 'Enter a start date';
    else if (startErr) errors.startDate = startErr.replace('Date of birth is not valid', 'Enter a valid date');
  }
  const end = form.endDate.trim();
  if (end) {
    const endErr = validateDateOfBirth(end, new Date(9999, 0, 1));
    if (endErr) errors.endDate = endErr.replace('Date of birth is not valid', 'Enter a valid date');
    else if (form.startDate.trim() && end < form.startDate.trim()) errors.endDate = 'End date cannot be before the start date';
  }
  return errors;
}

const sortedUnique = (t: string[]) => [...new Set(t)].sort();
const blankToUndefined = (s: string) => (s.trim() ? s.trim() : undefined);

export function buildCreatePayload(form: MedicineFormState): { payload: MedicineCreate | null; errors: MedicineFormErrors } {
  const errors = validate(form, 'create');
  if (Object.keys(errors).length > 0) return { payload: null, errors };
  const payload: MedicineCreate = {
    medicine_name: form.name.trim(),
    form: form.form,
    frequency_unit: form.frequency,
    time_of_day: form.frequency === 'AS_NEEDED' ? [] : sortedUnique(form.times),
    start_date: form.startDate.trim(),
  };
  if (form.dosage.trim()) payload.dosage = parseNumber(form.dosage);
  const unit = blankToUndefined(form.unit);
  if (unit) payload.dosage_unit = unit;
  if (form.endDate.trim()) payload.end_date = form.endDate.trim();
  const reason = blankToUndefined(form.reason);
  if (reason) payload.reason_for_use = reason;
  const instructions = blankToUndefined(form.instructions);
  if (instructions) payload.instructions = instructions;
  const notes = blankToUndefined(form.notes);
  if (notes) payload.notes = notes;
  return { payload, errors };
}

/** Partial update with only what changed. Clearing an optional field sends `null`. `start_date` is never sent. */
export function buildUpdateChanges(original: Medicine, form: MedicineFormState): { changes: MedicineUpdate; errors: MedicineFormErrors; schedulesRebuilt: boolean } {
  const errors = validate(form, 'edit');
  if (Object.keys(errors).length > 0) return { changes: {}, errors, schedulesRebuilt: false };
  const before = formFromMedicine(original);
  const changes: MedicineUpdate = {};

  if (form.name.trim() !== before.name) changes.medicine_name = form.name.trim();
  if (form.dosage.trim() !== before.dosage) changes.dosage = form.dosage.trim() ? parseNumber(form.dosage) : null;
  if (form.unit.trim() !== before.unit) changes.dosage_unit = form.unit.trim() || null;
  if (form.form !== before.form) changes.form = form.form;
  if (form.reason.trim() !== before.reason) changes.reason_for_use = form.reason.trim() || null;
  if (form.instructions.trim() !== before.instructions) changes.instructions = form.instructions.trim() || null;
  if (form.notes.trim() !== before.notes) changes.notes = form.notes.trim() || null;

  const newTimes = form.frequency === 'AS_NEEDED' ? [] : sortedUnique(form.times);
  const timesChanged = newTimes.join(',') !== sortedUnique(before.times).join(',');
  const freqChanged = form.frequency !== before.frequency;
  const endChanged = form.endDate.trim() !== before.endDate;
  if (freqChanged) changes.frequency_unit = form.frequency;
  if (timesChanged || freqChanged) changes.time_of_day = newTimes;
  if (endChanged) changes.end_date = form.endDate.trim() || null;

  return { changes, errors, schedulesRebuilt: freqChanged || timesChanged || endChanged };
}

const SERVER_FIELD_MAP: Record<string, keyof MedicineFormErrors> = {
  medicine_name: 'name', dosage: 'dosage', dosage_unit: 'unit', time_of_day: 'times', start_date: 'startDate', end_date: 'endDate', form: 'form',
};

/** Puts the backend's per-field validation messages next to the matching inputs; anything else becomes a banner message. */
export function mapServerErrors(fieldErrors: Record<string, string>, fallback: string): { errors: MedicineFormErrors; banner: string | null } {
  const errors: MedicineFormErrors = {};
  let placed = false;
  for (const [field, message] of Object.entries(fieldErrors)) {
    const key = SERVER_FIELD_MAP[field];
    if (key) {
      errors[key] = message;
      placed = true;
    }
  }
  return { errors, banner: placed ? null : fallback };
}
