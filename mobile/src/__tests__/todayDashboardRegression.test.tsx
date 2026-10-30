import path from 'path';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { authApi } from '@/api/auth';
import { dashboardApi } from '@/api/dashboard';
import { medicinesApi } from '@/api/medicines';
import { notificationsApi } from '@/api/notifications';
import { EMPTY_DASHBOARD, FULL_DASHBOARD, USER } from '@/test-utils/fixtures';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(k, v),
    deleteItemAsync: async (k: string) => void store.delete(k),
  };
});

jest.mock('@/api/auth', () => ({
  authApi: {
    me: jest.fn(),
    logout: jest.fn(async () => undefined),
  },
}));

jest.mock('@/api/dashboard', () => ({
  dashboardApi: {
    get: jest.fn(),
  },
}));

jest.mock('@/api/medicines', () => ({
  medicinesApi: {
    overallAdherence: jest.fn(async () => ({
      days: 30,
      scheduled_count: 10,
      taken_count: 9,
      skipped_count: 1,
      missed_count: 0,
      adherence_percent: 90,
    })),
  },
}));

jest.mock('@/api/notifications', () => ({
  notificationsApi: {
    refresh: jest.fn(async () => undefined),
    unreadCount: jest.fn(async () => 0),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const keystore: Map<string, string> = require('expo-secure-store').__store;
const APP_DIR = path.resolve(__dirname, '../app');
const auth = authApi as jest.Mocked<typeof authApi>;
const dashboard = dashboardApi as jest.Mocked<typeof dashboardApi>;

let app: ReturnType<typeof renderRouter>;
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
});

describe('Today Dashboard (Home Screen) Regressions', () => {
  it('renders zero-data state cleanly without fake metrics', async () => {
    dashboard.get.mockResolvedValue(EMPTY_DASHBOARD);

    await open('/home');

    expect(await screen.findByText('Asha')).toBeTruthy();
    expect(screen.getByText('Quick Health Entry')).toBeTruthy();
    expect(await screen.findByText('Take your first assessment')).toBeTruthy();
    expect(screen.getByText('Start assessment')).toBeTruthy();
    // No fabricated data
    expect(screen.queryByText(/Health score ·/i)).toBeNull();
  });

  it('renders populated dashboard with health score, medicines, and goals', async () => {
    dashboard.get.mockResolvedValue(FULL_DASHBOARD);

    await open('/home');

    expect(await screen.findByText('Asha')).toBeTruthy();
    expect(await screen.findByText(/Health score ·/i)).toBeTruthy();
    expect(screen.getByText(/Metformin/i)).toBeTruthy();
    expect(screen.getByText(/Lose 3 kg/i)).toBeTruthy();
    expect(screen.getByText(/You slept more this week than last week/i)).toBeTruthy();
  });

  it('opens Quick Health Entry modal on action button tap', async () => {
    dashboard.get.mockResolvedValue(EMPTY_DASHBOARD);

    await open('/home');

    const quickEntryBtn = await screen.findByText('Quick Health Entry');
    fireEvent.press(quickEntryBtn);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. Drank 500ml water or Slept 8 hours')).toBeTruthy();
      expect(screen.getByText('Parse Entry')).toBeTruthy();
    });
  });
});
