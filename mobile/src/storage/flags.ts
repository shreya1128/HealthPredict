import * as SecureStore from 'expo-secure-store';

import { DEFAULT_WELLNESS_PREFS, normalizePrefs, type WellnessPrefs } from '@/notifications/wellnessPlan';

const ONBOARDING_KEY = 'hp.onboarding_seen';

/** Non-sensitive UI flag; kept in the same store to avoid adding another storage dependency. */
export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ONBOARDING_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(ONBOARDING_KEY, '1');
  } catch {
    // Worst case the user sees onboarding once more.
  }
}

const reminderKey = (userId: number) => `hp.medicine_reminders.${userId}`;

/** Reminders are opt-in and remembered per user, so a different person signing in on the same phone starts with them off. */
export async function getRemindersEnabled(userId: number): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(reminderKey(userId))) === '1';
  } catch {
    return false;
  }
}

export async function setRemindersEnabled(userId: number, enabled: boolean): Promise<void> {
  try {
    if (enabled) await SecureStore.setItemAsync(reminderKey(userId), '1');
    else await SecureStore.deleteItemAsync(reminderKey(userId));
  } catch {
    // Preference simply isn't remembered.
  }
}

const wellnessKey = (userId: number) => `hp.wellness_reminders.${userId}`;

/** Per-user wellness reminder choices (hydration / bedtime). Always returns valid preferences. */
export async function getWellnessPrefs(userId: number): Promise<WellnessPrefs> {
  try {
    const raw = await SecureStore.getItemAsync(wellnessKey(userId));
    return raw ? normalizePrefs(JSON.parse(raw)) : DEFAULT_WELLNESS_PREFS;
  } catch {
    return DEFAULT_WELLNESS_PREFS; // missing, unreadable or corrupt: start from the safe defaults
  }
}

export async function setWellnessPrefs(userId: number, prefs: WellnessPrefs): Promise<void> {
  try {
    await SecureStore.setItemAsync(wellnessKey(userId), JSON.stringify(normalizePrefs(prefs)));
  } catch {
    // Preference simply isn't remembered.
  }
}
