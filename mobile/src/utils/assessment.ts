import type { AssessmentCreate } from '@/api/types';

/**
 * Turns the assessment form's text fields into the API payload.
 * Ranges mirror backend/app/schemas/health.py purely for instant feedback; the server stays the authority
 * and its own messages are shown for anything this lets through.
 */
export interface AssessmentForm {
  systolic: string;
  diastolic: string;
  heartRate: string;
  glucose: string;
  spo2: string;
  temperature: string;
  notes: string;
}
export type AssessmentField = keyof AssessmentForm | 'form';
export type AssessmentErrors = Partial<Record<AssessmentField, string>>;

export const EMPTY_ASSESSMENT_FORM: AssessmentForm = { systolic: '', diastolic: '', heartRate: '', glucose: '', spo2: '', temperature: '', notes: '' };

interface Spec {
  key: keyof AssessmentForm;
  label: string;
  min: number;
  max: number;
  integer: boolean;
}
export const SPECS: Spec[] = [
  { key: 'systolic', label: 'Systolic pressure', min: 60, max: 260, integer: true },
  { key: 'diastolic', label: 'Diastolic pressure', min: 30, max: 200, integer: true },
  { key: 'heartRate', label: 'Heart rate', min: 30, max: 220, integer: true },
  { key: 'glucose', label: 'Blood glucose', min: 20, max: 600, integer: true },
  { key: 'spo2', label: 'SpO2', min: 50, max: 100, integer: false },
  { key: 'temperature', label: 'Temperature', min: 30, max: 43, integer: false },
];

/** Accepts "36,6" as well as "36.6". Returns NaN for anything that isn't a plain number. */
export function parseNumber(text: string): number {
  const t = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

export function buildAssessmentPayload(form: AssessmentForm): { payload: AssessmentCreate | null; errors: AssessmentErrors } {
  const errors: AssessmentErrors = {};
  const values: Partial<Record<keyof AssessmentForm, number>> = {};

  for (const spec of SPECS) {
    const raw = form[spec.key].trim();
    if (!raw) continue;
    const n = parseNumber(raw);
    if (Number.isNaN(n)) errors[spec.key] = 'Enter a number';
    else if (spec.integer && !Number.isInteger(n)) errors[spec.key] = 'Use a whole number';
    else if (!spec.integer && !/^\d+(\.\d{1,2})?$/.test(raw.replace(',', '.'))) errors[spec.key] = 'At most 2 decimal places';
    else if (n < spec.min || n > spec.max) errors[spec.key] = `${spec.label} should be between ${spec.min} and ${spec.max}`;
    else values[spec.key] = n;
  }

  const hasSys = form.systolic.trim() !== '';
  const hasDia = form.diastolic.trim() !== '';
  if (hasSys !== hasDia) errors[hasSys ? 'diastolic' : 'systolic'] = 'Enter both blood pressure numbers, or neither';

  const anyVital = SPECS.some((s) => s.key !== 'diastolic' && form[s.key].trim() !== '');
  if (!anyVital && Object.keys(errors).length === 0) errors.form = 'Enter at least one measurement (blood pressure, heart rate, glucose, SpO2 or temperature).';

  if (Object.keys(errors).length > 0) return { payload: null, errors };

  const payload: AssessmentCreate = {};
  if (values.systolic !== undefined) payload.systolic_bp = values.systolic;
  if (values.diastolic !== undefined) payload.diastolic_bp = values.diastolic;
  if (values.heartRate !== undefined) payload.heart_rate_bpm = values.heartRate;
  if (values.glucose !== undefined) payload.blood_glucose_mg_dl = values.glucose;
  if (values.spo2 !== undefined) payload.spo2_percent = values.spo2;
  if (values.temperature !== undefined) payload.temperature_celsius = values.temperature;
  if (form.notes.trim()) payload.assessment_notes = form.notes.trim();
  return { payload, errors };
}
