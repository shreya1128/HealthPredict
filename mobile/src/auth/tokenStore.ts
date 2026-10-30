import type { TokenResponse } from '@/api/types';

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds, computed from the backend's `expires_in` (seconds). */
  accessExpiresAt: number;
}

/** What the API client needs from token storage. Implemented over SecureStore in the app, in-memory in tests. */
export interface TokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  getAccessExpiresAt(): number | null;
  set(tokens: TokenSet): Promise<void>;
  clear(): Promise<void>;
}

export function toTokenSet(response: Pick<TokenResponse, 'access_token' | 'refresh_token' | 'expires_in'>, now = Date.now()): TokenSet {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    accessExpiresAt: now + response.expires_in * 1000,
  };
}
