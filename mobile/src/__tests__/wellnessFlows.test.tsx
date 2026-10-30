import path from 'path';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { authApi } from '@/api/auth';
import { medicinesApi } from '@/api/medicines';
import { trackingApi } from '@/api/tracking';
import { reportsApi } from '@/api/reports';
import { Alert } from 'react-native';
import { ApiError } from '@/api/errors';
import type { ExerciseLog, Goal, HydrationLog, NutritionLog, SleepLog, WeeklyReport, WeeklyReportSummary } from '@/api/types';
import { USER, MED_DAILY } from '@/test-utils/fixtures';
import { localDateIso } from '@/utils/trackingForm';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(k, v),
    deleteItemAsync: async (k: string) => void store.delete(k),
  };
});
jest.mock('@/api/auth', () => ({ authApi: { me: jest.fn(), logout: jest.fn(async () => undefined) } }));
jest.mock('@/api/medicines', () => ({
  medicinesApi: {
    list: jest.fn(), today: jest.fn(), overallAdherence: jest.fn(), get: jest.fn(), schedule: jest.fn(), adherence: jest.fn(),
    create: jest.fn(), update: jest.fn(), remove: jest.fn(), markTaken: jest.fn(), markSkipped: jest.fn(),
  },
}));
jest.mock('@/api/tracking', () => ({
  TRACKING_OPTIONS: {
    intensities: [{ value: 'LOW', label: 'Low' }, { value: 'MODERATE', label: 'Moderate' }, { value: 'HIGH', label: 'High' }],
    meals: [{ value: 'BREAKFAST', label: 'Breakfast' }, { value: 'LUNCH', label: 'Lunch' }, { value: 'DINNER', label: 'Dinner' }, { value: 'SNACK', label: 'Snack' }],
    goalTypes: [{ value: 'EXERCISE', label: 'Exercise' }, { value: 'SLEEP', label: 'Sleep' }, { value: 'HYDRATION', label: 'Hydration' }, { value: 'WEIGHT', label: 'Weight' }, { value: 'MEDICINE_ADHERENCE', label: 'Medicine adherence' }, { value: 'OTHER', label: 'Other' }],
  },
  trackingApi: {
    exercises: jest.fn(), exerciseWeekly: jest.fn(), createExercise: jest.fn(), deleteExercise: jest.fn(),
    sleeps: jest.fn(), sleepWeekly: jest.fn(), createSleep: jest.fn(), deleteSleep: jest.fn(),
    hydration: jest.fn(), hydrationDaily: jest.fn(), createHydration: jest.fn(), deleteHydration: jest.fn(),
    nutrition: jest.fn(), nutritionDaily: jest.fn(), createNutrition: jest.fn(), deleteNutrition: jest.fn(),
    goals: jest.fn(), createGoal: jest.fn(), updateGoal: jest.fn(), deleteGoal: jest.fn(),
  },
}));
jest.mock('@/api/reports', () => ({ reportsApi: { weekly: jest.fn(), history: jest.fn(), pdf: jest.fn() } }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
  writeAsStringAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock('@/notifications/medicineReminders', () => ({
  configureNotifications: jest.fn(async () => undefined), syncMedicineReminders: jest.fn(async () => ({ status: 'disabled', scheduled: 0 })),
  getReminderPermission: jest.fn(async () => 'undetermined'), requestReminderPermission: jest.fn(async () => 'granted'),
  enableReminders: jest.fn(async () => 'granted'), disableReminders: jest.fn(async () => undefined), cancelMedicineReminders: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const keystore: Map<string, string> = require('expo-secure-store').__store;
const APP_DIR = path.resolve(__dirname, '../app');
const auth = authApi as jest.Mocked<typeof authApi>;
const meds = medicinesApi as jest.Mocked<typeof medicinesApi>;
const track = trackingApi as jest.Mocked<typeof trackingApi>;
const reports = reportsApi as jest.Mocked<typeof reportsApi>;
let app: ReturnType<typeof renderRouter>; // kept so the render result stays referenced for the test lifetime
async function open(url: string) {
  app = renderRouter(APP_DIR, { initialUrl: url });
  await act(async () => {});
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  keystore.clear();
  keystore.set('hp.refresh_token', 'r');
  keystore.set('hp.access_token', 'a');
  keystore.set('hp.access_expires_at', String(Date.now() + 600_000));
  auth.me.mockResolvedValue(USER);
  meds.list.mockResolvedValue([MED_DAILY]);
  meds.today.mockResolvedValue([]);
  meds.overallAdherence.mockResolvedValue({ days: 30, scheduled_count: 0, taken_count: 0, skipped_count: 0, missed_count: 0, adherence_percent: null });
  track.exercises.mockResolvedValue([]); track.exerciseWeekly.mockResolvedValue({ days: 7, total_minutes: 0, total_calories: 0, by_day: {} });
  track.sleeps.mockResolvedValue([]); track.sleepWeekly.mockResolvedValue({ days: 7, average_duration_hours: null, average_quality: null, by_day: {} });
  track.hydration.mockResolvedValue([]); track.hydrationDaily.mockResolvedValue({ date: '2026-10-09', total_ml: 0, goal_ml: null, percent_of_goal: null });
  track.nutrition.mockResolvedValue([]); track.nutritionDaily.mockResolvedValue({ date: '2026-10-09', total_calories: 0, meals_logged: [], entries: [] });
  track.goals.mockResolvedValue([]);
});


const TODAY = localDateIso();
const confirmAlerts = () =>
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === 'destructive')?.onPress?.();
  });

const exercise = (over: Partial<ExerciseLog> = {}): ExerciseLog => ({ id: 1, exercise_date: TODAY, exercise_type: 'Walking', duration_minutes: 30, intensity: 'MODERATE', calories_burned: 120, distance_km: 2.5, notes: null, created_at: null, ...over });
const sleep = (over: Partial<SleepLog> = {}): SleepLog => ({ id: 2, sleep_date: TODAY, bedtime: '22:30:00', wake_time: '06:30:00', sleep_duration_hours: 8, sleep_quality: 7, notes: null, created_at: null, ...over });
const water = (over: Partial<HydrationLog> = {}): HydrationLog => ({ id: 3, hydration_date: TODAY, water_intake_ml: 250, entry_time: '09:15:00', notes: null, created_at: null, ...over });
const meal = (over: Partial<NutritionLog> = {}): NutritionLog => ({ id: 4, nutrition_date: TODAY, meal_type: 'LUNCH', food_item: 'Dal rice', calories: 520, portion_size: '1 bowl', notes: null, created_at: null, ...over });
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 9, goal_type: 'EXERCISE', goal_description: 'Move more', target_value: 150, unit: 'minutes/week', start_date: TODAY, end_date: null,
  is_achieved: false, status: 'ACTIVE', current_value: 60, percentage_complete: 40, progress_note: null, ...over,
});
const tab = (name: string) => fireEvent.press(screen.getByLabelText(`${name} tab`));

describe('Track tab: other entry types', () => {
  it('saves sleep, auto-formatting typed times, and sends only valid values', async () => {
    track.createSleep.mockResolvedValue(sleep());
    await open('/track');
    await screen.findByText('Track your wellness');
    tab('Sleep');
    fireEvent.changeText(screen.getByLabelText(/Bedtime/), '2230');
    fireEvent.changeText(screen.getByLabelText(/Wake time/), '0630');
    expect(screen.getByLabelText(/Bedtime/).props.value).toBe('22:30');
    fireEvent.changeText(screen.getByLabelText(/Sleep quality/), '7');
    fireEvent.press(screen.getByLabelText('Save sleep'));
    await waitFor(() => expect(track.createSleep).toHaveBeenCalledWith({ sleep_date: TODAY, bedtime: '22:30', wake_time: '06:30', sleep_quality: 7 }));
    expect(await screen.findByText('Sleep entry saved.')).toBeTruthy();
  });

  it('refuses a half-filled sleep time pair without calling the API', async () => {
    await open('/track');
    await screen.findByText('Track your wellness');
    tab('Sleep');
    fireEvent.changeText(screen.getByLabelText(/Bedtime/), '2230');
    fireEvent.press(screen.getByLabelText('Save sleep'));
    expect(await screen.findByText('Enter both bedtime and wake time, or leave both blank.')).toBeTruthy();
    expect(track.createSleep).not.toHaveBeenCalled();
  });

  it('logs water with the 250 ml default and shows today\'s total against the real target', async () => {
    track.hydrationDaily.mockResolvedValue({ date: TODAY, total_ml: 1000, goal_ml: 2500, percent_of_goal: 40 });
    track.hydration.mockResolvedValue([water({ water_intake_ml: 1000 })]);
    track.createHydration.mockResolvedValue(water());
    await open('/track');
    await screen.findByText('Track your wellness');
    tab('Water');
    expect((await screen.findAllByText('1000 ml')).length).toBeGreaterThan(0); // today's total (and the entry row)
    expect(screen.getByText('2500 ml')).toBeTruthy();
    expect(screen.getByLabelText('Hydration 40 percent of target')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Add water intake'));
    await waitFor(() => expect(track.createHydration).toHaveBeenCalledWith({ hydration_date: TODAY, water_intake_ml: 250 }));
  });

  it('says the daily target is not set (instead of inventing one) when the profile has none', async () => {
    await open('/track');
    await screen.findByText('Track your wellness');
    tab('Water');
    expect(await screen.findByText('Not set in health profile')).toBeTruthy();
  });

  it('saves a meal without inventing calories', async () => {
    track.createNutrition.mockResolvedValue(meal());
    await open('/track');
    await screen.findByText('Track your wellness');
    tab('Meals');
    fireEvent.changeText(screen.getByLabelText('Food item (optional)'), 'Dal rice');
    fireEvent.press(screen.getByLabelText('Lunch'));
    fireEvent.press(screen.getByLabelText('Save meal'));
    await waitFor(() => expect(track.createNutrition).toHaveBeenCalledWith({ nutrition_date: TODAY, meal_type: 'LUNCH', food_item: 'Dal rice' }));
  });

  it('shows honest empty states', async () => {
    await open('/track');
    expect(await screen.findByText('No exercise logged')).toBeTruthy();
    tab('Sleep');
    expect(screen.getByText('No sleep logged')).toBeTruthy();
    tab('Meals');
    expect(screen.getByText('No meals logged')).toBeTruthy();
    tab('Goals');
    expect(screen.getByText('No goals yet')).toBeTruthy();
  });

  it('auto-formats typed dates and rejects an impossible one before calling the API', async () => {
    await open('/track');
    await screen.findByText('Track your wellness');
    fireEvent.changeText(screen.getByLabelText(/^Date/), '20261340');
    expect(screen.getByLabelText(/^Date/).props.value).toBe('2026-13-40');
    fireEvent.press(screen.getByLabelText('Save exercise'));
    expect(await screen.findByText('Enter a real calendar date in YYYY-MM-DD format.')).toBeTruthy();
    expect(track.createExercise).not.toHaveBeenCalled();
  });

  it('deleting an entry asks first, deletes it, and refreshes the list', async () => {
    const alert = confirmAlerts();
    track.exercises.mockResolvedValueOnce([exercise()]).mockResolvedValue([]);
    track.deleteExercise.mockResolvedValue(undefined);
    await open('/track');
    expect(await screen.findByText('Walking')).toBeTruthy();
    fireEvent.press(screen.getAllByRole('button', { name: /^Delete/ })[0]);
    expect(alert).toHaveBeenCalled();
    await waitFor(() => expect(track.deleteExercise).toHaveBeenCalledWith(1));
    expect(await screen.findByText('No exercise logged')).toBeTruthy();
  });

  it('a failed save shows the server message and does not claim success', async () => {
    track.createExercise.mockRejectedValue(new ApiError('validation', 'Exercise date cannot be in the future', 422));
    await open('/track');
    await screen.findByText('Track your wellness');
    fireEvent.changeText(screen.getByLabelText('Duration (minutes, optional)'), '30');
    fireEvent.press(screen.getByLabelText('Save exercise'));
    expect(await screen.findByText('Exercise date cannot be in the future')).toBeTruthy();
    expect(screen.queryByText('Exercise saved.')).toBeNull();
  });

  it('offers a retry when the server is unreachable, then recovers', async () => {
    track.exercises.mockRejectedValueOnce(new ApiError('network', "Can't reach the server."));
    await open('/track');
    expect(await screen.findByText("Can't connect")).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText('Track your wellness')).toBeTruthy();
  });
});

describe('Goals', () => {
  it('shows server-calculated progress and lets an active goal be paused or completed', async () => {
    track.goals.mockResolvedValue([goal()]);
    track.updateGoal.mockResolvedValue(goal({ status: 'PAUSED' }));
    await open('/track');
    await screen.findByText('Track your wellness');
    tab('Goals');
    expect(await screen.findByLabelText('Exercise progress 40 percent')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Pause'));
    await waitFor(() => expect(track.updateGoal).toHaveBeenCalledWith(9, { status: 'PAUSED' }));
    fireEvent.press(screen.getByLabelText('Complete'));
    await waitFor(() => expect(track.updateGoal).toHaveBeenCalledWith(9, { status: 'COMPLETED' }));
  });

  it('a paused goal offers Resume; a completed goal has no actions', async () => {
    track.goals.mockResolvedValue([goal({ id: 10, status: 'PAUSED' }), goal({ id: 11, status: 'COMPLETED', goal_description: 'Done goal' })]);
    await open('/track');
    await screen.findByText('Track your wellness');
    tab('Goals');
    expect(await screen.findByLabelText('Resume')).toBeTruthy();
    expect(screen.getAllByLabelText('Complete')).toHaveLength(1); // only the paused one
  });

  it('shows no progress bar when the server has no progress source ("Other" goals)', async () => {
    track.goals.mockResolvedValue([goal({ goal_type: 'OTHER', percentage_complete: null, current_value: null, goal_description: 'Be kind' })]);
    await open('/track');
    await screen.findByText('Track your wellness');
    tab('Goals');
    expect(await screen.findByText('Be kind')).toBeTruthy();
    expect(screen.queryByLabelText(/progress \d+ percent/)).toBeNull();
  });

  it('rejects a non-positive target locally', async () => {
    await open('/track');
    await screen.findByText('Track your wellness');
    tab('Goals');
    fireEvent.changeText(screen.getByLabelText('Target value'), '0');
    fireEvent.press(screen.getByLabelText('Create goal'));
    expect(await screen.findByText(/Enter a target greater than 0/)).toBeTruthy();
    expect(track.createGoal).not.toHaveBeenCalled();
  });
});

const report = (over: Partial<WeeklyReport> = {}): WeeklyReport => ({
  week_start_date: '2026-10-05', week_end_date: '2026-10-11', average_health_score: 74.5, weight_change_kg: null, total_exercise_minutes: 150,
  average_sleep_duration: 7.2, average_hydration_ml: 1800, medicine_adherence_percent: 80, goals_progress_percent: 40, significant_changes: [], recommendations: [], ...over,
});
const row = (over: Partial<WeeklyReportSummary> = {}): WeeklyReportSummary => ({ id: 77, week_start_date: '2026-10-05', week_end_date: '2026-10-11', average_health_score: 74.5, medicine_adherence_percent: 80, created_at: null, ...over });
const pdf = () => { const b = new ArrayBuffer(8); new Uint8Array(b).set([37, 80, 68, 70, 45, 49, 46, 52]); return b; };
const fileUri = 'file:///cache/healthpredict-report-2026-10-05.pdf';

describe('Weekly report PDF', () => {
  beforeEach(() => {
    reports.weekly.mockResolvedValue(report());
    reports.history.mockResolvedValue([row()]);
    reports.pdf.mockResolvedValue(pdf());
  });

  it('writes the exact PDF bytes (as base64) to the cache, shares it, then deletes the copy', async () => {
    await open('/reports');
    fireEvent.press(await screen.findByLabelText('Download and share PDF'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith(fileUri, expect.objectContaining({ mimeType: 'application/pdf' })));
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(fileUri, Buffer.from([37, 80, 68, 70, 45, 49, 46, 52]).toString('base64'), { encoding: 'base64' });
    await waitFor(() => expect(FileSystem.deleteAsync).toHaveBeenCalledWith(fileUri, { idempotent: true }));
  });

  it('still downloads this week\'s PDF when the history list failed to load (id looked up on demand, never 0)', async () => {
    reports.history.mockRejectedValueOnce(new ApiError('server', 'History unavailable', 500));
    await open('/reports');
    expect(await screen.findByText(/Report history could not be loaded/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Download and share PDF'));
    await waitFor(() => expect(reports.pdf).toHaveBeenCalledWith(77));
    expect(reports.pdf).not.toHaveBeenCalledWith(0);
  });

  it('explains instead of requesting a nonexistent report when this week has not been saved', async () => {
    reports.history.mockResolvedValue([]);
    await open('/reports');
    fireEvent.press(await screen.findByLabelText('Download and share PDF'));
    expect(await screen.findByText(/has not been saved yet/)).toBeTruthy();
    expect(reports.pdf).not.toHaveBeenCalled();
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it('opens a past week\'s PDF using that report\'s own id', async () => {
    reports.history.mockResolvedValue([row(), row({ id: 70, week_start_date: '2026-09-28', week_end_date: '2026-10-04' })]);
    await open('/reports');
    const buttons = await screen.findAllByLabelText('PDF');
    fireEvent.press(buttons[1]);
    await waitFor(() => expect(reports.pdf).toHaveBeenCalledWith(70));
  });

  it('a failed share still removes the temporary copy and tells the user', async () => {
    (Sharing.shareAsync as jest.Mock).mockRejectedValueOnce(new Error('Share cancelled by the system'));
    await open('/reports');
    fireEvent.press(await screen.findByLabelText('Download and share PDF'));
    expect(await screen.findByText('Share cancelled by the system')).toBeTruthy();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(fileUri, { idempotent: true });
  });

  it('when the device cannot share, it says so, does not share, and still removes the copy', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    await open('/reports');
    fireEvent.press(await screen.findByLabelText('Download and share PDF'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Sharing unavailable', expect.any(String)));
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(fileUri, { idempotent: true });
  });

  it('a failed download shows the server message and writes nothing', async () => {
    reports.pdf.mockRejectedValue(new ApiError('not_found', 'Report not found', 404));
    await open('/reports');
    fireEvent.press(await screen.findByLabelText('Download and share PDF'));
    expect(await screen.findByText('Report not found')).toBeTruthy();
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });
});
