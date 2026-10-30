import { buildAssessmentPayload, EMPTY_ASSESSMENT_FORM, parseNumber, type AssessmentForm } from '@/utils/assessment';

const form = (over: Partial<AssessmentForm>): AssessmentForm => ({ ...EMPTY_ASSESSMENT_FORM, ...over });

describe('buildAssessmentPayload', () => {
  it('maps a full form to the API payload with real numbers', () => {
    const { payload, errors } = buildAssessmentPayload(
      form({ systolic: '128', diastolic: '82', heartRate: '71', glucose: '96', spo2: '98.5', temperature: '36,8', notes: ' felt fine ' }),
    );
    expect(errors).toEqual({});
    expect(payload).toEqual({
      systolic_bp: 128, diastolic_bp: 82, heart_rate_bpm: 71, blood_glucose_mg_dl: 96,
      spo2_percent: 98.5, temperature_celsius: 36.8, assessment_notes: 'felt fine',
    });
  });

  it('sends only what was entered', () => {
    expect(buildAssessmentPayload(form({ heartRate: '64' })).payload).toEqual({ heart_rate_bpm: 64 });
  });

  it('requires at least one measurement', () => {
    const r = buildAssessmentPayload(form({ notes: 'just a note' }));
    expect(r.payload).toBeNull();
    expect(r.errors.form).toMatch(/at least one/i);
  });

  it('requires blood pressure as a pair, flagging the missing half', () => {
    expect(buildAssessmentPayload(form({ systolic: '120' })).errors.diastolic).toBeTruthy();
    expect(buildAssessmentPayload(form({ diastolic: '80', heartRate: '70' })).errors.systolic).toBeTruthy();
  });

  it('does not treat diastolic alone as a usable measurement', () => {
    const r = buildAssessmentPayload(form({ diastolic: '80' }));
    expect(r.payload).toBeNull();
  });

  it.each([
    [{ systolic: '40', diastolic: '80' }, 'systolic'],
    [{ heartRate: '300' }, 'heartRate'],
    [{ glucose: '5' }, 'glucose'],
    [{ spo2: '101' }, 'spo2'],
    [{ temperature: '45' }, 'temperature'],
  ] as const)('rejects out-of-range %j', (over, field) => {
    expect(buildAssessmentPayload(form(over)).errors[field]).toBeTruthy();
  });

  it('rejects non-numbers, fractions for whole-number fields, and >2 decimals', () => {
    expect(buildAssessmentPayload(form({ heartRate: 'abc' })).errors.heartRate).toBe('Enter a number');
    expect(buildAssessmentPayload(form({ heartRate: '70.5' })).errors.heartRate).toMatch(/whole/i);
    expect(buildAssessmentPayload(form({ temperature: '36.123' })).errors.temperature).toMatch(/2 decimal/i);
    expect(buildAssessmentPayload(form({ heartRate: '-5' })).errors.heartRate).toBe('Enter a number');
  });
});

describe('parseNumber', () => {
  it('handles comma decimals and rejects junk', () => {
    expect(parseNumber('36,6')).toBe(36.6);
    expect(Number.isNaN(parseNumber('1e3'))).toBe(true);
    expect(Number.isNaN(parseNumber(''))).toBe(true);
  });
});
