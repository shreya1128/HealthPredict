import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useUser } from '@/auth/AuthContext';
import { configureNotifications, syncMedicineReminders } from '@/notifications/medicineReminders';
import { medicineIdFromNotification } from '@/notifications/reminderPlan';
import { configureWellnessChannel, syncWellnessReminders } from '@/notifications/wellnessReminders';
import { wellnessKindFromNotification } from '@/notifications/wellnessPlan';

let lastHandled: string | null = null;

/**
 * Renders nothing. While signed in it (1) sets up notifications, (2) tops up medicine and wellness reminders at launch and
 * whenever the app returns to the foreground, and (3) opens the right screen when a reminder is tapped.
 */
export function ReminderBootstrap() {
  const router = useRouter();
  const userId = useUser().id;

  useEffect(() => {
    const sync = () => {
      void syncMedicineReminders(userId).catch(() => undefined);
      void syncWellnessReminders(userId).catch(() => undefined);
    };
    void Promise.all([configureNotifications(), configureWellnessChannel()]).then(sync, () => undefined);
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') sync();
    });

    const open = (response: Notifications.NotificationResponse | null) => {
      try {
        if (!response || response.notification?.request?.identifier === lastHandled) return;
        const id = medicineIdFromNotification(response);
        const wellness = id === null ? wellnessKindFromNotification(response) : null;
        if (id === null && wellness === null) return;
        lastHandled = response.notification.request.identifier;
        if (id !== null) router.push({ pathname: '/medicines/[id]', params: { id: String(id) } });
        else router.push('/track'); // hydration and bedtime reminders both lead to logging on the Track tab
      } catch (err) {
        console.warn('Failed to handle notification response', err);
      }
    };

    try {
      const initial = Notifications.getLastNotificationResponse?.();
      if (initial) open(initial);
    } catch {
      // In Expo Go or unit tests, getLastNotificationResponse may be unavailable
    }

    let tapSub: Notifications.Subscription | null = null;
    try {
      tapSub = Notifications.addNotificationResponseReceivedListener(open);
    } catch {
      // Non-fatal if listener registration fails
    }

    return () => {
      appState.remove();
      tapSub?.remove();
    };
  }, [userId, router]);

  return null;
}
