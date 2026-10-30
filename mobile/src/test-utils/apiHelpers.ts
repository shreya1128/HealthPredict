import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';

import type { TokenSet, TokenStore } from '@/auth/tokenStore';

export class MemoryTokenStore implements TokenStore {
  constructor(private tokens: TokenSet | null = null) {}
  getAccessToken = () => this.tokens?.accessToken ?? null;
  getRefreshToken = () => this.tokens?.refreshToken ?? null;
  getAccessExpiresAt = () => this.tokens?.accessExpiresAt ?? null;
  async set(t: TokenSet) {
    this.tokens = t;
  }
  async clear() {
    this.tokens = null;
  }
}

export interface RecordedCall {
  method: string;
  url: string;
  authorization: string | undefined;
  body: unknown;
}

export type Handler = (call: RecordedCall, n: number) => { status: number; data?: unknown } | 'network-error';

/** A fake axios adapter that records calls and answers via `handler`. No sockets involved. */
export function fakeAdapter(handler: Handler) {
  const calls: RecordedCall[] = [];
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const call: RecordedCall = {
      method: (config.method ?? 'get').toLowerCase(),
      url: config.url ?? '',
      authorization: config.headers.get('Authorization') as string | undefined,
      body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    };
    calls.push(call);
    await Promise.resolve(); // yield, so concurrent requests genuinely interleave
    const result = handler(call, calls.length);
    if (result === 'network-error') throw new AxiosError('Network Error', 'ERR_NETWORK', config);
    const response = { data: result.data ?? {}, status: result.status, statusText: '', headers: {}, config };
    if (result.status >= 200 && result.status < 300) return response;
    throw new AxiosError(`Request failed with status code ${result.status}`, 'ERR_BAD_REQUEST', config, undefined, response);
  };
  return { adapter, calls };
}

export const tokenBody = (access: string, refresh: string, expiresIn = 1800) => ({
  access_token: access,
  refresh_token: refresh,
  token_type: 'bearer',
  expires_in: expiresIn,
  user: { id: 1, email: 'a@b.co', full_name: 'A B', role: 'USER' },
});
