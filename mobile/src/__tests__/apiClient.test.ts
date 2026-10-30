import { createApiClient } from '@/api/createClient';
import { ApiError } from '@/api/errors';
import { toTokenSet } from '@/auth/tokenStore';

import { MemoryTokenStore, fakeAdapter, tokenBody, type Handler } from '@/test-utils/apiHelpers';

const NOW = Date.now();
const fresh = { accessToken: 'A1', refreshToken: 'R1', accessExpiresAt: NOW + 10 * 60_000 };

function setup(handler: Handler, tokens = new MemoryTokenStore(fresh)) {
  const { adapter, calls } = fakeAdapter(handler);
  const onSessionExpired = jest.fn();
  const { api } = createApiClient({ baseURL: 'http://x/api', timeout: 1000, tokens, onSessionExpired, adapter });
  return { api, calls, tokens, onSessionExpired };
}

describe('toTokenSet', () => {
  it('converts expires_in seconds into an absolute millisecond timestamp', () => {
    expect(toTokenSet(tokenBody('a', 'r', 1800), 1_000).accessExpiresAt).toBe(1_000 + 1_800_000);
  });
});

describe('API client auth handling', () => {
  it('sends the bearer token on normal requests but not on auth endpoints', async () => {
    const { api, calls } = setup(() => ({ status: 200 }));
    await api.get('/auth/me');
    await api.post('/auth/login', { email: 'a', password: 'b' });
    expect(calls[0].authorization).toBe('Bearer A1');
    expect(calls[1].authorization).toBeUndefined();
  });

  it('on 401 refreshes once, stores the ROTATED tokens, and retries with the new access token', async () => {
    const { api, calls, tokens } = setup((c) => {
      if (c.url === '/auth/refresh') return { status: 200, data: tokenBody('A2', 'R2') };
      return c.authorization === 'Bearer A2' ? { status: 200, data: { ok: true } } : { status: 401 };
    });
    const res = await api.get('/dashboard');
    expect(res.data).toEqual({ ok: true });
    expect(calls.map((c) => c.url)).toEqual(['/dashboard', '/auth/refresh', '/dashboard']);
    expect(calls[1].body).toEqual({ refresh_token: 'R1' });
    expect(tokens.getAccessToken()).toBe('A2');
    expect(tokens.getRefreshToken()).toBe('R2');
  });

  it('shares ONE refresh between concurrent 401s (backend rotates tokens, a 2nd call would break the session)', async () => {
    const { api, calls } = setup((c) => {
      if (c.url === '/auth/refresh') return { status: 200, data: tokenBody('A2', 'R2') };
      return c.authorization === 'Bearer A2' ? { status: 200 } : { status: 401 };
    });
    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(calls.filter((c) => c.url === '/auth/refresh')).toHaveLength(1);
  });

  it('refreshes proactively when the access token is about to expire (uses expires_in)', async () => {
    const tokens = new MemoryTokenStore({ ...fresh, accessExpiresAt: Date.now() + 5_000 });
    const { api, calls } = setup((c) => (c.url === '/auth/refresh' ? { status: 200, data: tokenBody('A2', 'R2') } : { status: 200 }), tokens);
    await api.get('/dashboard');
    expect(calls.map((c) => c.url)).toEqual(['/auth/refresh', '/dashboard']);
    expect(calls[1].authorization).toBe('Bearer A2'); // the stale token was never sent
  });

  it('ends the session only when the refresh token is rejected', async () => {
    const { api, tokens, onSessionExpired } = setup((c) => (c.url === '/auth/refresh' ? { status: 401 } : { status: 401 }));
    const err = await api.get('/dashboard').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe('unauthorized');
    expect(tokens.getRefreshToken()).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('does NOT sign the user out when refresh fails because the network is down', async () => {
    const { api, tokens, onSessionExpired } = setup((c) => (c.url === '/auth/refresh' ? 'network-error' : { status: 401 }));
    const err = await api.get('/dashboard').catch((e) => e);
    expect(err.kind).toBe('network');
    expect(tokens.getRefreshToken()).toBe('R1');
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('does not loop: a request that still 401s after a successful refresh fails after exactly one refresh', async () => {
    const { api, calls } = setup((c) => (c.url === '/auth/refresh' ? { status: 200, data: tokenBody('A2', 'R2') } : { status: 401 }));
    const err = await api.get('/dashboard').catch((e) => e);
    expect(err.kind).toBe('unauthorized');
    expect(calls.filter((c) => c.url === '/auth/refresh')).toHaveLength(1);
    expect(calls.filter((c) => c.url === '/dashboard')).toHaveLength(2);
  });

  it('does not try to refresh on a failed login (wrong password)', async () => {
    const { api, calls } = setup(() => ({ status: 401, data: { detail: 'Invalid email or password' } }));
    const err = await api.post('/auth/login', { email: 'a', password: 'b' }).catch((e) => e);
    expect(err.message).toBe('Invalid email or password');
    expect(calls).toHaveLength(1);
  });

  it('does not attempt refresh when there is no refresh token', async () => {
    const { api, calls } = setup(() => ({ status: 401 }), new MemoryTokenStore(null));
    await api.get('/dashboard').catch(() => undefined);
    expect(calls).toHaveLength(1);
  });
});
