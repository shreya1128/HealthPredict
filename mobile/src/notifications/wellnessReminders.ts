import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getWellnessPrefs, setWellnessPrefs } from '@/storage/flags';

import { getReminderPermission, type ReminderPermission } from './medicineReminders';
import { WELLNESS_KIND, normalizePrefs, planWellnessReminders, type WellnessPrefs } from './wellnessPlan';

/**
 * LOCAL wellness reminders (hydration, bedtime): repeating daily on-device notifications. Nothing is sent from a server
 * and no push credentials are involved. Only reminders created here (data.kind === 'wellness-reminder') are ever cancelled,
 * so medicine reminders and anything else are left alone.
 */
const CHANNEL_ID = 'wellness-reminders';

export async function configureWellnessChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: 'Wellness reminders', importance: Notifications.AndroidImportance.DEFAULT });
}

export async function cancelWellnessReminders(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => (n.content.data as Record<string, unknown> | null)?.kind === WELLNESS_KIND)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

export type WellnessSyncStatus = 'disabled' | 'no-permission' | 'ok';

async function doSync(userId: number): Promise<{ status: WellnessSyncStatus; scheduled: number }> {
  const plan = planWellnessReminders(await getWellnessPrefs(userId));
  if (plan.length === 0) {
    await cancelWellnessReminders();
    return { status: 'disabled', scheduled: 0 };
  }
  if ((await getReminderPermission()) !== 'granted') {
    await cancelWellnessReminders();
    return { status: 'no-permission', scheduled: 0 };
  }
  await cancelWellnessReminders();
  for (const r of plan) {
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body, sound: true, data: { kind: WELLNESS_KIND, wellness: r.kind } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: r.hour, minute: r.minute, channelId: CHANNEL_ID },
    });
  }
  return { status: 'ok', scheduled: plan.length };
}

// One sync at a time, so overlapping runs (app opens while settings are being saved) cannot leave duplicates.
let chain: Promise<unknown> = Promise.resolve();

export function syncWellnessReminders(userId: number): Promise<{ status: WellnessSyncStatus; scheduled: number }> {
  const run = chain.then(
    () => doSync(userId),
    () => doSync(userId),
  );
  chain = run.catch(() => undefined);
  return run;
}

/** Stores the choices and applies them. The caller is responsible for having asked for notification permission first. */
export async function saveWellnessPrefs(userId: number, prefs: WellnessPrefs): Promise<{ status: WellnessSyncStatus; scheduled: number }> {
  await setWellnessPrefs(userId, normalizePrefs(prefs));
  return syncWellnessReminders(userId);
}

export type { ReminderPermission };
