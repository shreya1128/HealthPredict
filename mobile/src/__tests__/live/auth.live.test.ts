/**
 * OPT-IN end-to-end test of the mobile auth layer against a RUNNING backend.
 *
 *   HP_LIVE=1 EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api \
 *   HP_BACKEND_LOG=/path/to/backend.log  npx jest src/__tests__/live
 *
 * Start the backend with RATE_LIMIT_ENABLED=false (this test makes more than 10 auth calls in a minute) and
 * ENVIRONMENT=development (the password-reset token is read from the backend log; there is no SMTP yet).
 * Uses the app's real authApi + API client + SecureStore token layer; only the native keystore is replaced
 * by an in-memory Map, because Jest has no iOS Keychain / Android Keystore.
 */
import { readFileSync } from 'fs';

import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

import { api } from '@/api/client';
import { authApi } from '@/api/auth';
import { ApiError } from '@/api/errors';
import { secureTokenStore } from '@/auth/secureTokenStore';
import { sessionEvents } from '@/api/session';
import { env } from '@/config/env';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(k, v),
    deleteItemAsync: async (k: string) => void store.delete(k),
  };
});

const live = process.env.HP_LIVE === '1' ? describe : describe.skip;
const keystore = (SecureStore as unknown as { __store: Map<string, string> }).__store;

const stamp = Date.now();
const EMAIL = `mobile.live.${stamp}@example.com`;
const PASSWORD = 'Str0ng!Pass1';
const NEW_PASSWORD = 'N3w!Passw0rd';

const expectApiError = async (p: Promise<unknown>, kind: string) => {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).kind).toBe(kind);
  return err as ApiError;
};

live('mobile auth layer against the real backend', () => {
  jest.setTimeout(30_000);

  it('points at the configured backend', () => {
    expect(env.apiUrlSource).toBe('env');
  });

  it('rejects a weak password with per-field errors', async () => {
    const err = await expectApiError(
      authApi.register({ email: EMAIL, password: 'weak', confirm_password: 'weak', full_name: 'Live Test', gender: 'FEMALE' }),
      'validation',
    );
    expect(Object.keys(err.fieldErrors).length).toBeGreaterThan(0);
  });

  it('registers (backend returns the user, not tokens)', async () => {
    const user = await authApi.register({
      email: EMAIL, password: PASSWORD, confirm_password: PASSWORD, full_name: 'Live Test', gender: 'FEMALE', date_of_birth: '1990-03-15',
    });
    expect(user.email).toBe(EMAIL);
    expect(user.role).toBe('USER');
    expect(secureTokenStore.getAccessToken()).toBeNull();
  });

  it('refuses a duplicate registration with a readable, non-connectivity error', async () => {
    const err = await authApi
      .register({ email: EMAIL, password: PASSWORD, confirm_password: PASSWORD, full_name: 'Live Test', gender: 'FEMALE' })
      .then(() => null, (e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).isConnectivity).toBe(false);
    expect((err as ApiError).message.length).toBeGreaterThan(0);
  });

  it('wrong password -> unauthorized with the server message, and nothing is stored', async () => {
    const err = await expectApiError(authApi.login(EMAIL, 'Wr0ng!Password'), 'unauthorized');
    expect(err.message).toMatch(/invalid/i);
    expect(secureTokenStore.getRefreshToken()).toBeNull();
  });

  it('logs in and persists access token, refresh token and expiry in the keystore', async () => {
    const user = await authApi.login(EMAIL, PASSWORD);
    expect(user.email).toBe(EMAIL);
    expect([...keystore.keys()].sort()).toEqual(['hp.access_expires_at', 'hp.access_token', 'hp.refresh_token']);
    const msLeft = secureTokenStore.getAccessExpiresAt()! - Date.now();
    expect(msLeft).toBeGreaterThan(25 * 60_000); // backend: 30-minute access token
    expect(msLeft).toBeLessThanOrEqual(30 * 60_000);
  });

  it('GET /auth/me works with the stored bearer token', async () => {
    expect((await authApi.me()).email).toBe(EMAIL);
  });

  it('proactively refreshes an (almost) expired access token and ROTATES the refresh token', async () => {
    const before = secureTokenStore.getRefreshToken()!;
    await secureTokenStore.set({ accessToken: secureTokenStore.getAccessToken()!, refreshToken: before, accessExpiresAt: Date.now() + 1000 });
    expect((await authApi.me()).email).toBe(EMAIL);
    expect(secureTokenStore.getRefreshToken()).not.toBe(before);
  });

  it('recovers from a 401 (bad access token) by refreshing and retrying transparently', async () => {
    await secureTokenStore.set({ accessToken: 'not.a.valid.jwt', refreshToken: secureTokenStore.getRefreshToken()!, accessExpiresAt: Date.now() + 10 * 60_000 });
    expect((await authApi.me()).email).toBe(EMAIL);
  });

  it('three simultaneous requests with an expired token all succeed (single shared refresh)', async () => {
    await secureTokenStore.set({ accessToken: secureTokenStore.getAccessToken()!, refreshToken: secureTokenStore.getRefreshToken()!, accessExpiresAt: Date.now() - 1000 });
    const results = await Promise.all([authApi.me(), authApi.me(), authApi.me()]);
    expect(results.every((u) => u.email === EMAIL)).toBe(true);
    expect(secureTokenStore.getRefreshToken()).toBeTruthy();
  });

  it('forgot-password gives the same answer for known and unknown emails (no account enumeration)', async () => {
    const known = await authApi.forgotPassword(EMAIL);
    const unknown = await authApi.forgotPassword(`nobody.${stamp}@example.com`);
    expect(known).toBe(unknown);
  });

  it('reset-password with the emailed (logged) token changes the password', async () => {
    const log = readFileSync(process.env.HP_BACKEND_LOG!, 'utf8');
    const matches = [...log.matchAll(new RegExp(`password reset token for ${EMAIL.replace(/\./g, '\\.')}: (\\S+)`, 'g'))];
    expect(matches.length).toBeGreaterThan(0);
    const token = matches[matches.length - 1][1];

    const bogus = await authApi.resetPassword('bogus-token', NEW_PASSWORD, NEW_PASSWORD).then(() => null, (e) => e);
    expect(bogus).toBeInstanceOf(ApiError); // an invalid token must be refused
    await authApi.resetPassword(token, NEW_PASSWORD, NEW_PASSWORD);

    await expectApiError(authApi.login(EMAIL, PASSWORD), 'unauthorized'); // old password dead
    expect((await authApi.login(EMAIL, NEW_PASSWORD)).email).toBe(EMAIL);
  });

  it('logout clears the device immediately and revokes the refresh token on the server', async () => {
    const refresh = secureTokenStore.getRefreshToken()!;
    await authApi.logout();
    expect(secureTokenStore.getRefreshToken()).toBeNull();
    expect(keystore.size).toBe(0);
    const res = await axios.post(`${env.apiBaseUrl}/auth/refresh`, { refresh_token: refresh }, { validateStatus: () => true });
    expect(res.status).toBe(401);
    await expectApiError(api.get('/auth/me'), 'unauthorized');
  });

  it('theft protection: replaying a rotated refresh token revokes ALL sessions, and the client ends the session cleanly', async () => {
    const expired = jest.fn();
    const unsubscribe = sessionEvents.subscribe(expired);

    await authApi.login(EMAIL, NEW_PASSWORD);
    const old = secureTokenStore.getRefreshToken()!;
    // Force one legitimate rotation.
    await secureTokenStore.set({ accessToken: secureTokenStore.getAccessToken()!, refreshToken: old, accessExpiresAt: Date.now() - 1000 });
    await authApi.me();
    const current = secureTokenStore.getRefreshToken()!;
    expect(current).not.toBe(old);

    // An attacker (or a buggy double-refresh) presents the OLD token: refused, and the backend revokes the whole family.
    const replay = await axios.post(`${env.apiBaseUrl}/auth/refresh`, { refresh_token: old }, { validateStatus: () => true });
    expect(replay.status).toBe(401);

    // The legitimate device's next request fails; the client wipes its tokens and signals "session expired" exactly once.
    await secureTokenStore.set({ accessToken: 'stale', refreshToken: current, accessExpiresAt: Date.now() + 10 * 60_000 });
    await expectApiError(authApi.me(), 'unauthorized');
    expect(secureTokenStore.getRefreshToken()).toBeNull();
    expect(keystore.size).toBe(0);
    expect(expired).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
