/**
 * Phase C flows on the REAL route tree with the real AuthProvider and screens. The keystore is pre-seeded so
 * the app starts signed in (exercising session restore); only the network layer is mocked.
 */
import path from 'path';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { authApi } from '@/api/auth';
import { dashboardApi } from '@/api/dashboard';
import { ApiError } from '@/api/errors';
import { healthApi } from '@/api/health';
import { profileApi } from '@/api/profile';
import {
  ASSESSMENT, ASSESSMENT_NEEDS_PROFILE, EMPTY_DASHBOARD, FULL_DASHBOARD, PROFILE, USER,
} from '@/test-utils/fixtures';

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
jest.mock('@/api/medicines', () => ({ medicinesApi: { overallAdherence: jest.fn(async () => ({ days: 30, scheduled_count: 0, taken_count: 0, skipped_count: 0, missed_count: 0, adherence_percent: null })) } }));
jest.mock('@/api/dashboard', () => ({ dashboardApi: { get: jest.fn() } }));
jest.mock('@/api/health', () => ({
  healthApi: { latest: jest.fn(), get: jest.fn(), list: jest.fn(), history: jest.fn(), createAssessment: jest.fn() },
}));
jest.mock('@/api/profile', () => ({ profileApi: { get: jest.fn(), update: jest.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const keystore: Map<string, string> = require('expo-secure-store').__store;
const APP_DIR = path.resolve(__dirname, '../app');
const auth = authApi as jest.Mocked<typeof authApi>;
const dash = dashboardApi as jest.Mocked<typeof dashboardApi>;
const health = healthApi as jest.Mocked<typeof healthApi>;
const profile = profileApi as jest.Mocked<typeof profileApi>;

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
  dash.get.mockResolvedValue(EMPTY_DASHBOARD);
  health.latest.mockResolvedValue(null);
});

describe('Home dashboard', () => {
  it('shows a first-assessment prompt and NO invented numbers for a brand-new user', async () => {
    await open('/home');
    expect(await screen.findByText('Take your first assessment')).toBeTruthy();
    expect(screen.queryByLabelText(/Health score \d+/)).toBeNull();
    expect(screen.queryByText("Today's medicines")).toBeNull();
    expect(screen.queryByText('Goals')).toBeNull();
    expect(screen.queryByText('Wellness')).toBeNull();
  });

  it('renders only real data: score, AI estimate, insights, medicines, wellness and goals', async () => {
    dash.get.mockResolvedValue(FULL_DASHBOARD);
    await open('/home');
    expect(await screen.findByLabelText('Health score 73 out of 100')).toBeTruthy();
    expect(screen.getByText('Moderate risk')).toBeTruthy();
    expect(screen.getByText(/AI estimate: moderate risk \(54%\)/)).toBeTruthy();
    expect(screen.getByText('You slept more this week than last week.')).toBeTruthy();
    expect(screen.getByText('Metformin')).toBeTruthy();
    expect(screen.getByText('Taken')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('1200 / 2400 ml')).toBeTruthy();
    expect(screen.getByText('150 min')).toBeTruthy();
    expect(screen.getByText('7.3 h')).toBeTruthy();
    expect(screen.getByText('Lose 3 kg')).toBeTruthy();
  });

  it('shows a retryable error (not a blank screen) when the server is unreachable, then recovers', async () => {
    dash.get.mockRejectedValueOnce(new ApiError('network', "Can't reach the server."));
    await open('/home');
    expect(await screen.findByText("Can't connect")).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText('Take your first assessment')).toBeTruthy();
    expect(dash.get).toHaveBeenCalledTimes(2);
  });
});

describe('Health tab', () => {
  it('invites a first assessment when none exists, and opens the form', async () => {
    await open('/health');
    expect(await screen.findByText('No assessment yet')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Start your first assessment'));
    await waitFor(() => expect(pathname()).toBe('/assessment/new'));
  });

  it('summarises the latest assessment and flags a missing AI estimate honestly', async () => {
    health.latest.mockResolvedValue(ASSESSMENT_NEEDS_PROFILE);
    await open('/health');
    expect(await screen.findByText('AI estimate needs 2 more details')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('View full results'));
    await waitFor(() => expect(pathname()).toBe('/assessment/6'));
  });
});

describe('New assessment', () => {
  it('blocks an empty submission and an unpaired blood pressure without calling the API', async () => {
    await open('/assessment/new');
    fireEvent.press(screen.getByLabelText('Calculate my results'));
    expect(await screen.findByText(/^Enter at least one measurement/)).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Systolic (top)'), '120');
    fireEvent.press(screen.getByLabelText('Calculate my results'));
    expect(await screen.findByText('Enter both blood pressure numbers, or neither')).toBeTruthy();
    expect(health.createAssessment).not.toHaveBeenCalled();
  });

  it('submits the readings, then shows the result with score breakdown and the AI explanation', async () => {
    health.createAssessment.mockResolvedValue(ASSESSMENT);
    health.get.mockResolvedValue(ASSESSMENT);
    await open('/assessment/new');
    fireEvent.changeText(screen.getByLabelText('Systolic (top)'), '128');
    fireEvent.changeText(screen.getByLabelText('Diastolic (bottom)'), '82');
    fireEvent.changeText(screen.getByLabelText('Heart rate'), '71');
    fireEvent.press(screen.getByLabelText('Calculate my results'));

    await waitFor(() => expect(pathname()).toBe('/assessment/5'));
    expect(health.createAssessment).toHaveBeenCalledWith({ systolic_bp: 128, diastolic_bp: 82, heart_rate_bpm: 71 });

    expect(await screen.findByLabelText('Health score 73 out of 100')).toBeTruthy();
    // why the score is what it is
    expect(screen.getByText('Vital signs')).toBeTruthy();
    expect(screen.getByText('80/100 · counts 40%')).toBeTruthy();
    expect(screen.getByText(/Sleep: no sleep duration in your profile/)).toBeTruthy();
    // AI estimate + explanation
    expect(screen.getByText('54%')).toBeTruthy();
    expect(screen.getByText('Your age and blood pressure raised the estimate most.')).toBeTruthy();
    expect(screen.getByText('What raised the estimate')).toBeTruthy();
    expect(screen.getByText('What lowered the estimate')).toBeTruthy();
    expect(screen.getByText('Age')).toBeTruthy();
    expect(screen.getByText('Physical activity')).toBeTruthy();
    // disclaimers, and only the measurements that were actually entered
    expect(screen.getByText('Not a diagnosis.')).toBeTruthy();
    expect(screen.getByText('128/82 mmHg')).toBeTruthy();
    expect(screen.queryByText('Blood glucose')).toBeNull();
  });

  it('shows the server message when the backend rejects the request', async () => {
    health.createAssessment.mockRejectedValue(new ApiError('validation', 'Provide at least one vital sign', 422));
    await open('/assessment/new');
    fireEvent.changeText(screen.getByLabelText('Heart rate'), '70');
    fireEvent.press(screen.getByLabelText('Calculate my results'));
    expect(await screen.findByText('Provide at least one vital sign')).toBeTruthy();
    expect(pathname()).toBe('/assessment/new');
  });
});

describe('Assessment result without an AI estimate', () => {
  it('lists exactly what is missing and sends the user to the profile editor (never a fabricated estimate)', async () => {
    health.get.mockResolvedValue(ASSESSMENT_NEEDS_PROFILE);
    profile.get.mockResolvedValue(PROFILE);
    await open('/assessment/6');
    expect(await screen.findByText('height and weight in your profile')).toBeTruthy();
    expect(screen.getByText('cholesterol level in your profile')).toBeTruthy();
    expect(screen.queryByText('What raised the estimate')).toBeNull();
    fireEvent.press(screen.getByLabelText('Complete health profile'));
    await waitFor(() => expect(pathname()).toBe('/health-profile'));
  });
});

describe('History & trends', () => {
  const points = [
    { tracking_date: '2026-10-01', health_score: 70, bmi: null, weight_kg: null, systolic_bp: 130, diastolic_bp: 85, heart_rate_bpm: 75, blood_glucose_mg_dl: null, spo2_percent: null, risk_category: 'MODERATE' },
    { tracking_date: '2026-10-05', health_score: 74, bmi: null, weight_kg: null, systolic_bp: 124, diastolic_bp: 80, heart_rate_bpm: null, blood_glucose_mg_dl: null, spo2_percent: null, risk_category: 'MODERATE' },
  ];

  it('draws a chart only for metrics that have data', async () => {
    health.history.mockResolvedValue({ days: 30, points });
    await open('/history');
    expect(await screen.findByText('Health score')).toBeTruthy();
    expect(screen.getByText('Blood pressure')).toBeTruthy();
    expect(screen.getByText('Heart rate')).toBeTruthy();
    expect(screen.queryByText('Weight')).toBeNull();
    expect(screen.queryByText('Blood glucose')).toBeNull();
    expect(health.history).toHaveBeenCalledWith(30);
  });

  it('refetches when the time range changes', async () => {
    health.history.mockResolvedValue({ days: 30, points });
    await open('/history');
    await screen.findByText('Health score');
    fireEvent.press(screen.getByLabelText('90 days'));
    await waitFor(() => expect(health.history).toHaveBeenCalledWith(90));
  });

  it('shows an empty state with a way forward when the period has no data', async () => {
    health.history.mockResolvedValue({ days: 30, points: [] });
    await open('/history');
    expect(await screen.findByText('No data in this period')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('New assessment'));
    await waitFor(() => expect(pathname()).toBe('/assessment/new'));
  });

  it('lists past assessments and opens one', async () => {
    health.list.mockResolvedValue({
      items: [{ id: 9, assessment_date: '2026-10-05', health_score: 74.4, risk_category: 'MODERATE', data_completeness_percent: 60, created_at: null }],
      total: 1, page: 1, page_size: 20,
    });
    health.get.mockResolvedValue({ ...ASSESSMENT, id: 9 });
    await open('/history');
    fireEvent.press(await screen.findByLabelText('Assessments'));
    fireEvent.press(await screen.findByLabelText(/Assessment on .*score 74.4/));
    await waitFor(() => expect(pathname()).toBe('/assessment/9'));
  });
});

describe('Health profile editor', () => {
  it('loads saved values and saves ONLY what changed', async () => {
    profile.get.mockResolvedValue(PROFILE);
    profile.update.mockResolvedValue({ ...PROFILE, weight_kg: 70.5 });
    await open('/health-profile');
    expect((await screen.findByLabelText('Height')).props.value).toBe('170');
    fireEvent.changeText(screen.getByLabelText('Weight'), '70.5');
    fireEvent.press(screen.getAllByLabelText('Never')[0]); // first group is Smoking
    fireEvent.press(screen.getByLabelText('Save profile'));
    await waitFor(() => expect(profile.update).toHaveBeenCalledWith({ weight_kg: 70.5, smoking_status: 'NEVER' }));
  });

  it('does not call the API for invalid values', async () => {
    profile.get.mockResolvedValue(PROFILE);
    await open('/health-profile');
    fireEvent.changeText(await screen.findByLabelText('Height'), '20');
    fireEvent.press(screen.getByLabelText('Save profile'));
    expect(await screen.findByText(/Height should be between 50 and 250/)).toBeTruthy();
    expect(profile.update).not.toHaveBeenCalled();
  });
});
