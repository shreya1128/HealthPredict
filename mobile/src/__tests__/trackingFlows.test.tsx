import path from 'path';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { authApi } from '@/api/auth';
import { medicinesApi } from '@/api/medicines';
import { trackingApi } from '@/api/tracking';
import { reportsApi } from '@/api/reports';
import { USER, MED_DAILY } from '@/test-utils/fixtures';

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
let app: ReturnType<typeof renderRouter>;
const pathname = () => app.getPathname();
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

describe('Track tab', () => {
  it('saves an exercise record using the validated user-entered values', async () => {
    track.createExercise.mockResolvedValue({ id: 11, exercise_date: '2026-10-09', exercise_type: 'Walking', duration_minutes: 25, intensity: 'MODERATE', calories_burned: null, distance_km: null, notes: null, created_at: null });
    await open('/track');
    fireEvent.changeText(await screen.findByLabelText('Activity'), 'Walking');
    fireEvent.changeText(screen.getByLabelText('Duration (minutes, optional)'), '25');
    fireEvent.press(screen.getByLabelText('Save exercise'));
    expect(await screen.findByText('Exercise saved.')).toBeTruthy();
    expect(track.createExercise).toHaveBeenCalledWith(expect.objectContaining({ exercise_type: 'Walking', duration_minutes: 25, intensity: 'MODERATE' }));
  });

  it('creates a goal and refreshes live progress data', async () => {
    track.createGoal.mockResolvedValue({ id: 7, goal_type: 'EXERCISE', goal_description: 'Move more', target_value: 120, unit: 'minutes/week', start_date: '2026-10-09', end_date: null, is_achieved: false, status: 'ACTIVE', current_value: 0, percentage_complete: 0, progress_note: null });
    await open('/track');
    fireEvent.press(await screen.findByLabelText('Goals tab'));
    fireEvent.changeText(screen.getByLabelText('Description (optional)'), 'Move more');
    fireEvent.changeText(screen.getByLabelText('Target value'), '120');
    fireEvent.press(screen.getByLabelText('Create goal'));
    expect(await screen.findByText('Goal created. Progress is calculated from your recorded data.')).toBeTruthy();
    expect(track.createGoal).toHaveBeenCalledWith(expect.objectContaining({ goal_type: 'EXERCISE', target_value: 120, goal_description: 'Move more' }));
    expect(track.goals.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('Weekly reports', () => {
  it('keeps the current report visible when history fails to load', async () => {
    reports.weekly.mockResolvedValue({ week_start_date: '2026-10-05', week_end_date: '2026-10-11', average_health_score: 72, weight_change_kg: null, total_exercise_minutes: 90, average_sleep_duration: 7.5, average_hydration_ml: 1600, medicine_adherence_percent: null, goals_progress_percent: null, significant_changes: [], recommendations: [] });
    reports.history.mockRejectedValue(new Error('History request failed'));
    await open('/reports');
    expect(await screen.findByText('Weekly reports')).toBeTruthy();
    expect(await screen.findByText('Total exercise')).toBeTruthy();
    expect(await screen.findByText(/Report history could not be loaded: History request failed/)).toBeTruthy();
    expect(await screen.findByText('History unavailable')).toBeTruthy();
  });

  it('loads the real report/history APIs and downloads then shares an authenticated PDF', async () => {
    reports.weekly.mockResolvedValue({ week_start_date: '2026-10-05', week_end_date: '2026-10-11', average_health_score: 72, weight_change_kg: null, total_exercise_minutes: 90, average_sleep_duration: 7.5, average_hydration_ml: 1600, medicine_adherence_percent: null, goals_progress_percent: null, significant_changes: [], recommendations: [] });
    reports.history.mockResolvedValue([{ id: 42, week_start_date: '2026-10-05', week_end_date: '2026-10-11', average_health_score: 72, medicine_adherence_percent: null, created_at: null }]);
    const pdfBuffer = new ArrayBuffer(4);
    new Uint8Array(pdfBuffer).set([37, 80, 68, 70]);
    reports.pdf.mockResolvedValue(pdfBuffer);
    await open('/reports');
    expect(await screen.findByText('Weekly reports')).toBeTruthy();
    expect(await screen.findByText('Total exercise')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Download and share PDF'));
    await waitFor(() => expect(reports.pdf).toHaveBeenCalledWith(42));
    // Native file/share calls are mocked; this verifies orchestration, not actual device behavior.
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    await waitFor(() => expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/healthpredict-report-2026-10-05.pdf', { idempotent: true }));
    expect(pathname()).toBe('/reports');
  });
});
