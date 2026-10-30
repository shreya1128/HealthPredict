/**
 * Renders the REAL route tree (src/app) with the REAL AuthProvider and drives the main flows in Jest.
 * Only the native keystore and the network layer (authApi) are mocked. This verifies routing, guards,
 * form validation and screen wiring in a JS runtime; it is NOT a substitute for testing on a phone.
 */
import path from 'path';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, testRouter, waitFor } from 'expo-router/testing-library';

import { authApi } from '@/api/auth';
import { dashboardApi } from '@/api/dashboard';
import { healthApi } from '@/api/health';
import { EMPTY_DASHBOARD } from '@/test-utils/fixtures';
import { ApiError } from '@/api/errors';
import type { User } from '@/api/types';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(k, v),
    deleteItemAsync: async (k: string) => void store.delete(k),
  };
});

jest.mock('@/api/auth', () => ({
  authApi: {
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(async () => undefined),
    me: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  },
}));

jest.mock('@/api/medicines', () => ({ medicinesApi: { overallAdherence: jest.fn(async () => ({ days: 30, scheduled_count: 0, taken_count: 0, skipped_count: 0, missed_count: 0, adherence_percent: null })) } }));
jest.mock('@/api/dashboard', () => ({ dashboardApi: { get: jest.fn() } }));
jest.mock('@/api/health', () => ({ healthApi: { latest: jest.fn() } }));

const APP_DIR = path.resolve(__dirname, '../app');
const api = authApi as jest.Mocked<typeof authApi>;

const USER: User = {
  id: 7, email: 'asha@example.com', full_name: 'Asha Rao', phone: null, date_of_birth: '1990-03-15',
  gender: 'FEMALE', role: 'USER', is_active: true, email_verified: false, created_at: '2026-01-10T08:00:00Z',
};

let app: ReturnType<typeof renderRouter>;
const pathname = () => app.getPathname();
/** Renders the app at a URL and lets the launch-time session check settle (avoids stray act() warnings). */
async function open(initialUrl = '/') {
  app = renderRouter(APP_DIR, { initialUrl });
  await act(async () => {});
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  (dashboardApi.get as jest.Mock).mockResolvedValue(EMPTY_DASHBOARD);
  (healthApi.latest as jest.Mock).mockResolvedValue(null);
});

describe('app launch & onboarding', () => {
  it('shows the splash, then sends a first-time signed-out user to onboarding', async () => {
    await open('/');
    await waitFor(() => expect(pathname()).toBe('/onboarding'), { timeout: 10_000 });
    expect(screen.getByText('Understand your health')).toBeTruthy();
  });

  it('walks the three slides and lands on login via "I already have an account"', async () => {
    await open('/onboarding');
    fireEvent.press(screen.getByLabelText('Next'));
    fireEvent.press(screen.getByLabelText('Next'));
    expect(screen.getByLabelText('Create your account')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('I already have an account'));
    await waitFor(() => expect(pathname()).toBe('/login'));
  });
});

describe('sign in', () => {
  it('validates empty fields locally without calling the API', async () => {
    await open('/login');
    fireEvent.press(screen.getByLabelText('Sign in'));
    expect(await screen.findByText('Enter your email address')).toBeTruthy();
    expect(screen.getByText('Enter your password')).toBeTruthy();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('shows the server message when credentials are wrong and stays on login', async () => {
    api.login.mockRejectedValueOnce(new ApiError('unauthorized', 'Invalid email or password', 401));
    await open('/login');
    fireEvent.changeText(screen.getByLabelText('Email'), 'asha@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
    fireEvent.press(screen.getByLabelText('Sign in'));
    expect(await screen.findByText('Invalid email or password')).toBeTruthy();
    expect(pathname()).toBe('/login');
  });

  it('on success enters the protected area and greets the user by first name; no invented health data', async () => {
    api.login.mockResolvedValueOnce(USER);
    await open('/login');
    fireEvent.changeText(screen.getByLabelText('Email'), 'asha@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'Str0ng!Pass1');
    fireEvent.press(screen.getByLabelText('Sign in'));

    await waitFor(() => expect(pathname()).toBe('/home'));
    expect(api.login).toHaveBeenCalledWith('asha@example.com', 'Str0ng!Pass1');
    expect(screen.getByText('Asha')).toBeTruthy();
    expect(await screen.findByText('Take your first assessment')).toBeTruthy();
    expect(screen.queryByLabelText(/Health score \d+/)).toBeNull(); // a new user has no score: nothing is invented
  });
});

describe('protected area', () => {
  async function signIn() {
    api.login.mockResolvedValueOnce(USER);
    await open('/login');
    fireEvent.changeText(screen.getByLabelText('Email'), 'asha@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'Str0ng!Pass1');
    fireEvent.press(screen.getByLabelText('Sign in'));
    await waitFor(() => expect(pathname()).toBe('/home'));
  }

  it('exposes the health section route to a signed-in user (Track, Medicines and Reports have their own flow tests)', async () => {
    await signIn();
    for (const [route, text] of [
      ['/health', 'No assessment yet'],
    ] as const) {
      testRouter.navigate(route);
      await waitFor(() => expect(pathname()).toBe(route));
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it('profile shows real account details', async () => {
    await signIn();
    testRouter.navigate('/profile');
    await waitFor(() => expect(pathname()).toBe('/profile'));
    expect(screen.getByText('Asha Rao')).toBeTruthy();
    expect(screen.getByText('1990-03-15')).toBeTruthy();
  });

  it('sign out (after confirming) returns to login, revokes the session, and re-locks protected routes', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    await signIn();
    fireEvent.press(screen.getAllByLabelText('Sign out')[0]);

    await waitFor(() => expect(pathname()).toBe('/login'));
    expect(api.logout).toHaveBeenCalledTimes(1);

    // A deep link into a protected route while signed out must bounce to login.
    // (Plain `router`, not `testRouter`: the latter asserts the destination, and here we expect a redirect.)
    act(() => router.navigate('/home'));
    await waitFor(() => expect(pathname()).toBe('/login'));
  });
});

describe('registration', () => {
  it('blocks a weak password and mismatched confirmation locally', async () => {
    await open('/register');
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Asha Rao');
    fireEvent.changeText(screen.getByLabelText('Email'), 'asha@example.com');
    fireEvent.press(screen.getByLabelText('Female'));
    fireEvent.changeText(screen.getByLabelText('Password'), 'weak');
    fireEvent.changeText(screen.getByLabelText('Confirm password'), 'different');
    fireEvent.press(screen.getByLabelText('Create account'));
    expect(await screen.findByText('Passwords do not match')).toBeTruthy();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('requires a gender choice (the ML model needs it)', async () => {
    await open('/register');
    fireEvent.press(screen.getByLabelText('Create account'));
    expect(await screen.findByText('Select one option')).toBeTruthy();
  });

  it('submits a valid form, then auto-signs-in and enters the app', async () => {
    api.register.mockResolvedValueOnce(USER);
    api.login.mockResolvedValueOnce(USER);
    await open('/register');
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Asha Rao');
    fireEvent.changeText(screen.getByLabelText('Email'), 'Asha@Example.com');
    fireEvent.press(screen.getByLabelText('Female'));
    fireEvent.changeText(screen.getByLabelText('Date of birth (optional)'), '19900315');
    fireEvent.changeText(screen.getByLabelText('Password'), 'Str0ng!Pass1');
    fireEvent.changeText(screen.getByLabelText('Confirm password'), 'Str0ng!Pass1');
    fireEvent.press(screen.getByLabelText('Create account'));

    await waitFor(() => expect(pathname()).toBe('/home'));
    expect(api.register).toHaveBeenCalledWith({
      full_name: 'Asha Rao', email: 'asha@example.com', password: 'Str0ng!Pass1', confirm_password: 'Str0ng!Pass1',
      gender: 'FEMALE', date_of_birth: '1990-03-15', timezone: expect.any(String),
    });
  });
});

describe('password reset', () => {
  it('forgot-password calls the API and shows the (non-enumerating) server message', async () => {
    api.forgotPassword.mockResolvedValueOnce('If an account exists for that email, a reset link has been sent.');
    await open('/forgot-password');
    fireEvent.changeText(screen.getByLabelText('Email'), 'asha@example.com');
    fireEvent.press(screen.getByLabelText('Send reset instructions'));
    expect(await screen.findByText(/If an account exists/)).toBeTruthy();
  });

  it('a deep link pre-fills the token, and success returns to login with a confirmation', async () => {
    api.resetPassword.mockResolvedValueOnce('Password updated.');
    await open('/reset-password?token=abc123');
    expect(screen.getByLabelText('Reset token').props.value).toBe('abc123');
    fireEvent.changeText(screen.getByLabelText('New password'), 'N3w!Passw0rd');
    fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'N3w!Passw0rd');
    fireEvent.press(screen.getByLabelText('Update password'));

    await waitFor(() => expect(pathname()).toBe('/login'));
    expect(api.resetPassword).toHaveBeenCalledWith('abc123', 'N3w!Passw0rd', 'N3w!Passw0rd');
    expect(await screen.findByText(/Your password was updated/)).toBeTruthy();
  });
});
