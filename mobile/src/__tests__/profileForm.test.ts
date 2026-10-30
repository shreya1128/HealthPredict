import type { HealthProfile } from '@/api/types';
import { buildProfileChanges, formFromProfile } from '@/utils/profileForm';

const profile: HealthProfile = {
  height_cm: 170, weight_kg: 68, bmi: 23.5, waist_circumference_cm: null, blood_type: null,
  exercise_frequency: 'LIGHT', sleep_duration_hours: 7, smoking_status: null, alcohol_consumption: null,
  cholesterol_level: null, diet_type: null, water_intake_goal_ml: null,
  user: {
    id: 1, email: 'a@b.co', full_name: 'A B', phone: null, date_of_birth: '1990-03-15', gender: 'FEMALE',
    role: 'USER', is_active: true, email_verified: true, created_at: null,
  },
};

describe('buildProfileChanges', () => {
  it('sends nothing when nothing changed', () => {
    expect(buildProfileChanges(profile, formFromProfile(profile))).toEqual({ changes: {}, errors: {} });
  });

  it('sends ONLY the fields that changed (the backend applies exactly the keys it receives)', () => {
    const form = { ...formFromProfile(profile), weight: '70.5', smoking: 'NEVER' as const, cholesterol: 'NORMAL' as const };
    expect(buildProfileChanges(profile, form).changes).toEqual({ weight_kg: 70.5, smoking_status: 'NEVER', cholesterol_level: 'NORMAL' });
  });

  it('routes account fields (gender, date of birth) as well', () => {
    const form = { ...formFromProfile(profile), gender: 'MALE' as const, dob: '1991-01-02' };
    expect(buildProfileChanges(profile, form).changes).toEqual({ gender: 'MALE', date_of_birth: '1991-01-02' });
  });

  it('validates ranges and formats without sending anything invalid', () => {
    const form = { ...formFromProfile(profile), height: '20', weight: 'abc', sleep: '30', dob: '1990-02-31' };
    const { changes, errors } = buildProfileChanges(profile, form);
    expect(changes).toEqual({});
    expect(Object.keys(errors).sort()).toEqual(['dob', 'height', 'sleep', 'weight']);
  });

  it('leaves blank fields alone instead of clearing them', () => {
    const form = { ...formFromProfile(profile), height: '', exercise: null };
    expect(buildProfileChanges(profile, form).changes).toEqual({});
  });

  it('validates and sends the daily water goal (whole ml, 500 to 10000)', () => {
    const base = formFromProfile(profile);
    expect(buildProfileChanges(profile, { ...base, waterGoal: '3000' }).changes).toEqual({ water_intake_goal_ml: 3000 });
    for (const bad of ['100', '20000', '2500.5', 'abc']) {
      const r = buildProfileChanges(profile, { ...base, waterGoal: bad });
      expect(r.errors.waterGoal).toBeTruthy();
      expect(r.changes).toEqual({});
    }
  });
});
