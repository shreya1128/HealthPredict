import { buildExercisePayload, buildHydrationPayload, buildNutritionPayload, buildSleepPayload, defaultGoalUnit, isIsoCalendarDate, localDateIso } from '@/utils/trackingForm';

describe('wellness form payloads', () => {
  it('uses local calendar dates instead of UTC conversion', () => {
    expect(localDateIso(new Date(2026, 0, 2, 23, 30))).toBe('2026-01-02');
  });

  it('validates exercise and omits optional blank fields', () => {
    expect(buildExercisePayload({ exercise_type: '', exercise_date: '2026-10-09', duration_minutes: '', intensity: 'MODERATE', calories_burned: '', distance_km: '', notes: '' }).error).toBe('Enter an activity type.');
    expect(buildExercisePayload({ exercise_type: ' Walking ', exercise_date: '2026-10-09', duration_minutes: '25', intensity: 'MODERATE', calories_burned: '', distance_km: '', notes: '' })).toEqual({
      payload: { exercise_type: 'Walking', exercise_date: '2026-10-09', duration_minutes: 25, intensity: 'MODERATE' }, error: null,
    });
  });

  it('rejects incomplete sleep times and includes the pair together', () => {
    expect(buildSleepPayload({ sleep_date: '2026-10-09', bedtime: '22:00', wake_time: '', sleep_quality: '', notes: '' }).error).toMatch(/both bedtime and wake time/i);
    expect(buildSleepPayload({ sleep_date: '2026-10-09', bedtime: '22:00', wake_time: '06:30', sleep_quality: '8', notes: '' })).toEqual({
      payload: { sleep_date: '2026-10-09', bedtime: '22:00', wake_time: '06:30', sleep_quality: 8 }, error: null,
    });
  });

  it('validates water amounts against the API range', () => {
    expect(buildHydrationPayload({ hydration_date: '2026-10-09', water_intake_ml: '0', notes: '' }).error).toMatch(/between 1 and 5000/i);
    expect(buildHydrationPayload({ hydration_date: '2026-10-09', water_intake_ml: '350', notes: '' }).payload).toEqual({ hydration_date: '2026-10-09', water_intake_ml: 350 });
  });

  it('preserves meal type and does not invent calories', () => {
    expect(buildNutritionPayload({ nutrition_date: '2026-10-09', meal_type: 'LUNCH', food_item: 'Rice', calories: '', portion_size: '', notes: '' }).payload).toEqual({ nutrition_date: '2026-10-09', meal_type: 'LUNCH', food_item: 'Rice' });
  });


  it('rejects impossible calendar dates and fractional values for integer API fields', () => {
    expect(isIsoCalendarDate('2026-02-29')).toBe(false);
    expect(isIsoCalendarDate('2024-02-29')).toBe(true);
    expect(buildExercisePayload({ exercise_type: 'Walk', exercise_date: '2026-02-30', duration_minutes: '', intensity: 'MODERATE', calories_burned: '', distance_km: '', notes: '' }).error).toMatch(/real calendar date/i);
    expect(buildExercisePayload({ exercise_type: 'Walk', exercise_date: '2026-10-09', duration_minutes: '12.5', intensity: 'MODERATE', calories_burned: '', distance_km: '', notes: '' }).error).toMatch(/duration/i);
    expect(buildHydrationPayload({ hydration_date: '2026-10-09', water_intake_ml: '250.5', notes: '' }).error).toMatch(/between 1 and 5000/i);
    expect(buildExercisePayload({ exercise_type: 'Walk', exercise_date: '2026-10-09', duration_minutes: '', intensity: 'MODERATE', calories_burned: '', distance_km: '1.234', notes: '' }).error).toMatch(/2 decimal places/i);
    expect(buildExercisePayload({ exercise_type: 'Walk', exercise_date: '2026-10-09', duration_minutes: '', intensity: 'MODERATE', calories_burned: '', distance_km: '1.23', notes: '' }).payload).toEqual({ exercise_type: 'Walk', exercise_date: '2026-10-09', intensity: 'MODERATE', distance_km: 1.23 });
    expect(buildNutritionPayload({ nutrition_date: '2026-10-09', meal_type: 'LUNCH', food_item: 'Rice', calories: '99.5', portion_size: '', notes: '' }).error).toMatch(/calories/i);
  });

  it('provides units only as display defaults for each supported goal type', () => {
    expect(defaultGoalUnit('EXERCISE')).toBe('minutes/week');
    expect(defaultGoalUnit('OTHER')).toBe('');
  });
});
