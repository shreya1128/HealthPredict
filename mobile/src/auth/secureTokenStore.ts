import * as SecureStore from 'expo-secure-store';

import type { TokenSet, TokenStore } from './tokenStore';

// SecureStore keys may only contain alphanumerics, ".", "-" and "_".
const KEY_ACCESS = 'hp.access_token';
const KEY_REFRESH = 'hp.refresh_token';
const KEY_EXPIRES = 'hp.access_expires_at';

/**
 * Tokens live in the OS keychain (iOS) / Keystore-backed encrypted storage (Android) via expo-secure-store,
 * never in plain AsyncStorage. A small in-memory copy avoids hitting the keystore on every request.
 */
class SecureTokenStore implements TokenStore {
  private access: string | null = null;
  private refresh: string | null = null;
  private expiresAt: number | null = null;

  /** Reads persisted tokens into memory. Call once at app start, before the first API request. */
  async load(): Promise<void> {
    const [access, refresh, expires] = await Promise.all([
      SecureStore.getItemAsync(KEY_ACCESS),
      SecureStore.getItemAsync(KEY_REFRESH),
      SecureStore.getItemAsync(KEY_EXPIRES),
    ]);
    const expiresNum = expires ? Number(expires) : NaN;
    this.access = access;
    this.refresh = refresh;
    this.expiresAt = Number.isFinite(expiresNum) ? expiresNum : null;
  }

  getAccessToken() {
    return this.access;
  }
  getRefreshToken() {
    return this.refresh;
  }
  getAccessExpiresAt() {
    return this.expiresAt;
  }

  async set(tokens: TokenSet): Promise<void> {
    // Memory first, so requests issued immediately afterwards already use the new tokens.
    this.access = tokens.accessToken;
    this.refresh = tokens.refreshToken;
    this.expiresAt = tokens.accessExpiresAt;
    await Promise.all([
      SecureStore.setItemAsync(KEY_ACCESS, tokens.accessToken),
      SecureStore.setItemAsync(KEY_REFRESH, tokens.refreshToken),
      SecureStore.setItemAsync(KEY_EXPIRES, String(tokens.accessExpiresAt)),
    ]);
  }

  async clear(): Promise<void> {
    this.access = null;
    this.refresh = null;
    this.expiresAt = null;
    await Promise.all([
      SecureStore.deleteItemAsync(KEY_ACCESS),
      SecureStore.deleteItemAsync(KEY_REFRESH),
      SecureStore.deleteItemAsync(KEY_EXPIRES),
    ]);
  }
}

export const secureTokenStore = new SecureTokenStore();
