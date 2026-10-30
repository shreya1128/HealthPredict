import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { disableReminders, enableReminders, getReminderPermission, type ReminderPermission } from '@/notifications/medicineReminders';
import { getRemindersEnabled } from '@/storage/flags';
import { colors } from '@/theme';

/** Opt-in switch for on-device medicine reminders. Explains honestly when the OS has notifications blocked. */
export function ReminderCard({ userId }: { userId: number }) {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<ReminderPermission>('undetermined');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getRemindersEnabled(userId), getReminderPermission()]).then(([e, p]) => {
      if (cancelled) return;
      setEnabled(e && p === 'granted'); // "on" only counts if the OS still allows it
      setPermission(p);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      if (next) {
        const p = await enableReminders(userId);
        setPermission(p);
        setEnabled(p === 'granted');
      } else {
        await disableReminders(userId);
        setEnabled(false);
      }
    } finally {
      setBusy(false);
    }
  }

  const blocked = permission === 'denied';
  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.texts}>
          <AppText variant="h3">Dose reminders</AppText>
          <AppText variant="caption" color="textMuted">
            {enabled ? 'You will be notified at your scheduled dose times.' : 'Get a notification at each scheduled dose time.'}
          </AppText>
        </View>
        <Switch
          accessibilityLabel="Dose reminders"
          value={enabled}
          disabled={busy}
          onValueChange={(v) => void toggle(v)}
          trackColor={{ true: colors.primaryMid, false: colors.borderStrong }}
          thumbColor="#FFFFFF"
        />
      </View>
      {blocked ? (
        <View style={styles.blocked}>
          <AppText variant="caption" color="warning">
            Notifications are turned off for HealthPredict on this phone, so reminders can&apos;t be shown.
          </AppText>
          <Button label="Open phone settings" variant="secondary" onPress={() => void Linking.openSettings()} />
        </View>
      ) : null}
      <AppText variant="caption" color="textSubtle" style={styles.note}>
        Reminders are set on this device from your schedule for the next 14 days and refreshed whenever you open the app.
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  texts: { flex: 1, gap: 2 },
  blocked: { marginTop: 12, gap: 10 },
  note: { marginTop: 12 },
});
