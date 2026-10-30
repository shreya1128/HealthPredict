import { create as createAxios, isAxiosError, type AxiosAdapter, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

import type { TokenStore } from '@/auth/tokenStore';
import { toTokenSet } from '@/auth/tokenStore';

import { SessionExpiredError, toApiError } from './errors';
import type { TokenResponse } from './types';

export interface ApiClientOptions {
  baseURL: string;
  timeout: number;
  tokens: TokenStore;
  /** Called once when the refresh token is rejected and the local session has been wiped. */
  onSessionExpired: () => void;
  /** Test seam only. */
  adapter?: AxiosAdapter;
  /** Refresh proactively when the access token has less than this many ms left. */
  refreshSkewMs?: number;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

// Endpoints that authenticate with a body/nothing rather than a bearer token: never attach one, never "refresh and retry".
const NO_BEARER_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout', '/auth/forgot-password', '/auth/reset-password'];
const isNoBearerPath = (url?: string) => !!url && NO_BEARER_PATHS.some((p) => url.includes(p));

/**
 * Builds the app's single HTTP client, following the backend's existing auth contract
 * (POST /auth/refresh rotates the refresh token and returns a full TokenResponse).
 *
 *  - Adds `Authorization: Bearer <access>` to every non-auth request.
 *  - Refreshes shortly *before* expiry (using `expires_in`) and, as a fallback, after a 401, then retries once.
 *  - Single-flight: simultaneous refresh triggers share one /auth/refresh call (the backend rotates the token,
 *    so a second concurrent call with the old token would otherwise invalidate the session).
 *  - Only a rejected refresh token ends the session; a network failure during refresh does NOT log the user out.
 *  - Every failure is rethrown as an `ApiError` with a user-safe message.
 */
export function createApiClient(options: ApiClientOptions): { api: AxiosInstance; bare: AxiosInstance } {
  const { baseURL, timeout, tokens, onSessionExpired, adapter, refreshSkewMs = 30_000 } = options;
  const common = { baseURL, timeout, headers: { 'Content-Type': 'application/json' }, adapter };

  // `bare` has no interceptors, so the refresh call can never recurse into itself.
  const bare = createAxios(common);
  const api = createAxios(common);

  let inFlight: Promise<void> | null = null;

  async function doRefresh(): Promise<void> {
    const refreshToken = tokens.getRefreshToken();
    if (!refreshToken) throw new SessionExpiredError();
    try {
      const { data } = await bare.post<TokenResponse>('/auth/refresh', { refresh_token: refreshToken });
      await tokens.set(toTokenSet(data));
    } catch (error) {
      if (isAxiosError(error) && error.response && [400, 401, 403].includes(error.response.status)) {
        await tokens.clear();
        onSessionExpired();
        throw new SessionExpiredError();
      }
      throw error; // offline / server error: keep the session, let the caller see the real problem
    }
  }

  function refreshOnce(): Promise<void> {
    if (!inFlight) {
      inFlight = doRefresh().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  api.interceptors.request.use(async (config) => {
    if (isNoBearerPath(config.url)) return config;

    const expiresAt = tokens.getAccessExpiresAt();
    if (tokens.getRefreshToken() && expiresAt !== null && expiresAt - Date.now() < refreshSkewMs) {
      try {
        await refreshOnce();
      } catch (error) {
        if (error instanceof SessionExpiredError) throw error;
        // Couldn't refresh (offline?). Try with the current token; the request will fail on its own if it must.
      }
    }
    const access = tokens.getAccessToken();
    if (access) config.headers.set('Authorization', `Bearer ${access}`);
    return config;
  });

  api.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      if (isAxiosError(error)) {
        const original = error.config as RetriableConfig | undefined;
        if (
          error.response?.status === 401 &&
          original &&
          !original._retried &&
          !isNoBearerPath(original.url) &&
          tokens.getRefreshToken()
        ) {
          original._retried = true;
          try {
            await refreshOnce();
          } catch (refreshError) {
            throw toApiError(refreshError);
          }
          const access = tokens.getAccessToken();
          if (access) original.headers.set('Authorization', `Bearer ${access}`);
          return api.request(original);
        }
      }
      throw toApiError(error);
    },
  );

  return { api, bare };
}
