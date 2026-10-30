import { secureTokenStore } from '@/auth/secureTokenStore';
import { env } from '@/config/env';

import { createApiClient } from './createClient';
import { sessionEvents } from './session';

/** The one HTTP client the whole app uses. */
export const { api } = createApiClient({
  baseURL: env.apiBaseUrl,
  timeout: env.apiTimeoutMs,
  tokens: secureTokenStore,
  onSessionExpired: () => sessionEvents.emitExpired(),
});
