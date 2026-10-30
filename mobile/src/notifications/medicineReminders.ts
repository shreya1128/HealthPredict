import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { medicinesApi } from '@/api/medicines';
import { notificationsApi } from '@/api/notifications';
import { getRemindersEnabled, setRemindersEnabled } from '@/storage/flags';

import { HORIZON_DAYS, REMINDER_KIND, planReminders } from './reminderPlan';

/**
 * Local (on-device) medicine reminders. Nothing is sent from a server and no push credentials are involved.
 * Reminders are built from the backend's real schedule rows for the next 14 days and re-synced whenever the
 * app opens or a medicine/dose changes. See mobile/README.md for what was and was not verified on a device.
 */
const CHANNEL_ID = 'medicine-reminders';

export type ReminderPermission = 'granted' | 'denied' | 'undetermined';
export type SyncStatus = 'disabled' | 'no-permission' | 'ok';

function toPermission(p: { granted: boolean; status: string; canAskAgain: boolean }): ReminderPermission {
  if (p.granted) return 'granted';
  return p.status === 'denied' && !p.canAskAgain ? 'denied' : p.status === 'undetermined' ? 'undetermined' : 'denied';
}

/** Call once at startup: foreground display behaviour + the Android channel. */
export async function configureNotifications(): Promise<void> {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Medicine reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
  } catch {
    // Non-fatal if notification setup fails on unsupported environments
  }
}

export async function getReminderPermission(): Promise<ReminderPermission> {
  return toPermission(await Notifications.getPermissionsAsync());
}

export async function requestReminderPermission(): Promise<ReminderPermission> {
  return toPermission(await Notifications.requestPermissionsAsync());
}

/** Cancels only our own scheduled reminders (other kinds of notifications are left alone). */
export async function cancelMedicineReminders(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => (n.content.data as Record<string, unknown> | null)?.kind === REMINDER_KIND)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

async function doSync(userId: number): Promise<{ status: SyncStatus; scheduled: number }> {
  if (!(await getRemindersEnabled(userId))) {
    await cancelMedicineReminders();
    return { status: 'disabled', scheduled: 0 };
  }
  if ((await getReminderPermission()) !== 'granted') {
    await cancelMedicineReminders();
    return { status: 'no-permission', scheduled: 0 };
  }

  // Fetch first: if the network is down this throws and the reminders already scheduled stay in place.
  const medicines = (await medicinesApi.list()).filter((m) => m.is_active && m.frequency_unit !== 'AS_NEEDED');
  const items = await Promise.all(medicines.map(async (medicine) => ({ medicine, entries: await medicinesApi.schedule(medicine.id, 0, HORIZON_DAYS) })));
  const plan = planReminders(items, new Date());

  await cancelMedicineReminders();
  for (const r of plan) {
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body, sound: true, data: { kind: REMINDER_KIND, medicineId: r.medicineId, scheduleId: r.scheduleId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.when, channelId: CHANNEL_ID },
    });
  }
  return { status: 'ok', scheduled: plan.length };
}

// Syncs run one at a time. Overlapping runs (e.g. open app + log a dose) would otherwise each cancel and
// re-schedule concurrently and could leave duplicate reminders.
let chain: Promise<unknown> = Promise.resolve();

export function syncMedicineReminders(userId: number): Promise<{ status: SyncStatus; scheduled: number }> {
  const run = chain.then(
    () => doSync(userId),
    () => doSync(userId),
  );
  chain = run.catch(() => undefined);
  return run;
}

async function registerRemotePushToken(): Promise<void> {
  try {
    const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    if (isExpoGo) return; // Expo Go doesn't support remote push in modern SDKs

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;
    if (!projectId || projectId === 'your-eas-project-id') return;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    if (tokenData?.data) {
      await notificationsApi.registerDevice(tokenData.data, Platform.OS);
    }
  } catch {
    // Simulator, offline, or unconfigured EAS project - local fallback stays intact
  }
}

/** Turns reminders on: asks the OS for permission first, and only remembers "on" if it was granted. */
export async function enableReminders(userId: number): Promise<ReminderPermission> {
  let permission = await getReminderPermission();
  if (permission !== 'granted') permission = await requestReminderPermission();
  if (permission !== 'granted') return permission;
  await setRemindersEnabled(userId, true);
  await registerRemotePushToken().catch(() => undefined);
  await syncMedicineReminders(userId).catch(() => undefined);
  return permission;
}

export async function disableReminders(userId: number): Promise<void> {
  await setRemindersEnabled(userId, false);
  await cancelMedicineReminders();
  try {
    const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    if (isExpoGo) return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;
    if (!projectId || projectId === 'your-eas-project-id') return;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    if (tokenData?.data) {
      await notificationsApi.unregisterDevice(tokenData.data);
    }
  } catch {
    // ignore
  }
}

