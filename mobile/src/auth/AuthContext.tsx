import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { authApi } from '@/api/auth';
import { toApiError } from '@/api/errors';
import { sessionEvents } from '@/api/session';
import type { RegisterPayload, User } from '@/api/types';

import { cancelMedicineReminders } from '@/notifications/medicineReminders';
import { cancelWellnessReminders } from '@/notifications/wellnessReminders';

import { secureTokenStore } from './secureTokenStore';

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated' }
  /** Signed in on this device but the server couldn't be reached at launch. The session is kept. */
  | { status: 'error'; message: string };

interface AuthContextValue {
  state: AuthState;
  /** Throws an ApiError on failure (wrong password, offline, ...). */
  signIn: (email: string, password: string) => Promise<void>;
  /** Creates the account, then signs in. `autoSignedIn: false` means the account exists but login must be done manually. */
  signUp: (payload: RegisterPayload) => Promise<{ autoSignedIn: boolean }>;
  signOut: () => void;
  /** Re-run the launch check (used by the "Try again" button). */
  retry: () => Promise<void>;
  /** Reload the user record from the server. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Restores the session on launch: no stored tokens -> signed out; otherwise ask the server who we are. */
async function resolveSession(): Promise<AuthState> {
  try {
    await secureTokenStore.load();
    if (!secureTokenStore.getRefreshToken()) return { status: 'unauthenticated' };
    // The API client refreshes an expired access token transparently before/after this call.
    return { status: 'authenticated', user: await authApi.me() };
  } catch (e) {
    const err = toApiError(e);
    if (err.isConnectivity) return { status: 'error', message: err.message };
    await secureTokenStore.clear();
    return { status: 'unauthenticated' };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void resolveSession().then((next) => {
      // Only settle if nothing else has (e.g. the user signed in while the launch check was still running).
      if (!cancelled) setState((current) => (current.status === 'loading' ? next : current));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The API client wipes tokens and emits this when the refresh token is rejected (expired/revoked).
  useEffect(
    () =>
      sessionEvents.subscribe(() => {
        void cancelMedicineReminders().catch(() => undefined);
        void cancelWellnessReminders().catch(() => undefined);
        setState({ status: 'unauthenticated' });
      }),
    [],
  );

  const retry = useCallback(async () => {
    setState({ status: 'loading' });
    setState(await resolveSession());
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const user = await authApi.login(email, password);
    setState({ status: 'authenticated', user });
  }, []);

  const signUp = useCallback(
    async (payload: RegisterPayload) => {
      await authApi.register(payload);
      try {
        await signIn(payload.email, payload.password);
        return { autoSignedIn: true };
      } catch {
        return { autoSignedIn: false };
      }
    },
    [signIn],
  );

  const signOut = useCallback(() => {
    // authApi.logout() clears the in-memory tokens synchronously, then revokes server-side in the background,
    // so the UI never waits on (or gets stuck behind) a slow network.
    void authApi.logout();
    // Reminders belong to the signed-in person; never leave them firing for someone else on a shared phone.
    void cancelMedicineReminders().catch(() => undefined);
    void cancelWellnessReminders().catch(() => undefined);
    setState({ status: 'unauthenticated' });
  }, []);

  const refreshUser = useCallback(async () => {
    const user = await authApi.me();
    setState({ status: 'authenticated', user });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, signIn, signUp, signOut, retry, refreshUser }),
    [state, signIn, signUp, signOut, retry, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For screens inside the protected area, where a user is guaranteed to exist. */
export function useUser(): User {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('useUser called while not authenticated');
  return state.user;
}
