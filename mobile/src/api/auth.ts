import { secureTokenStore } from '@/auth/secureTokenStore';
import { toTokenSet } from '@/auth/tokenStore';

import { api } from './client';
import type { MessageResponse, RegisterPayload, TokenResponse, User } from './types';

/** Thin wrappers over the existing backend /auth endpoints. All business rules stay on the server. */
export const authApi = {
  async login(email: string, password: string): Promise<User> {
    const { data } = await api.post<TokenResponse>('/auth/login', { email: email.trim(), password });
    await secureTokenStore.set(toTokenSet(data));
    return data.user;
  },

  async register(payload: RegisterPayload): Promise<User> {
    const { data } = await api.post<User>('/auth/register', payload);
    return data; // the backend returns the new user, not tokens: the caller logs in next
  },

  /** Clears the local session first (so the UI is never stuck signed-in), then revokes the refresh token server-side. */
  async logout(): Promise<void> {
    const refreshToken = secureTokenStore.getRefreshToken();
    await secureTokenStore.clear();
    if (refreshToken) {
      try {
        await api.post('/auth/logout', { refresh_token: refreshToken });
      } catch {
        // Offline or already revoked: the device is signed out either way.
      }
    }
  },

  async me(): Promise<User> {
    const { data } = await api.get<User>('/auth/me');
    return data;
  },

  async forgotPassword(email: string): Promise<string> {
    const { data } = await api.post<MessageResponse>('/auth/forgot-password', { email: email.trim() });
    return data.message;
  },

  async resetPassword(token: string, password: string, confirmPassword: string): Promise<string> {
    const { data } = await api.post<MessageResponse>('/auth/reset-password', {
      token: token.trim(),
      password,
      confirm_password: confirmPassword,
    });
    return data.message;
  },
};
