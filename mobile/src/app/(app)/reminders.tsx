import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { useUser } from '@/auth/AuthContext';
import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { TextField } from '@/components/ui/TextField';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { getReminderPermission, requestReminderPermission } from '@/notifications/medicineReminders';
import { DEFAULT_WELLNESS_PREFS, INTERVAL_CHOICES, formatClock, hydrationHours, validatePrefs, type WellnessPrefs } from '@/notifications/wellnessPlan';
import { saveWellnessPrefs } from '@/notifications/wellnessReminders';
import { getWellnessPrefs } from '@/storage/flags';
import { colors } from '@/theme';
import { formatTimeInput, isValidTime } from '@/utils/medicineForm';

const INTERVALS = INTERVAL_CHOICES.map((n) => ({ value: String(n), label: n === 1 ? 'Every hour' : `Every ${n} hours` }));

/** Local, on-device wellness reminders. Nothing here is sent by a server. */
export default function RemindersScreen() {
  useStatusBarStyle('dark');
  const router = useRouter();
  const userId = useUser().id;
  const [prefs, setPrefs] = useState<WellnessPrefs>(DEFAULT_WELLNESS_PREFS);
  const [startText, setStartText] = useState(String(DEFAULT_WELLNESS_PREFS.hydration.startHour));
  const [endText, setEndText] = useState(String(DEFAULT_WELLNESS_PREFS.hydration.endHour));
  const [sleepText, setSleepText] = useState(formatClock(DEFAULT_WELLNESS_PREFS.sleep.hour, DEFAULT_WELLNESS_PREFS.sleep.minute));
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<{ hydration?: string; sleep?: string }>({});
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getWellnessPrefs(userId).then((p) => {
      if (cancelled) return;
      setPrefs(p);
      setStartText(String(p.hydration.startHour));
      setEndText(String(p.hydration.endHour));
      setSleepText(formatClock(p.sleep.hour, p.sleep.minute));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const hydration = (patch: Partial<WellnessPrefs['hydration']>) => setPrefs((p) => ({ ...p, hydration: { ...p.hydration, ...patch } }));
  const sleep = (patch: Partial<WellnessPrefs['sleep']>) => setPrefs((p) => ({ ...p, sleep: { ...p.sleep, ...patch } }));

  function currentPrefs(): { prefs: WellnessPrefs; errors: { hydration?: string; sleep?: string } } {
    const next: WellnessPrefs = { hydration: { ...prefs.hydration }, sleep: { ...prefs.sleep } };
    const found: { hydration?: string; sleep?: string } = {};
    if (next.hydration.enabled) {
      const s = Number(startText);
      const e = Number(endText);
      if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || s > 23 || e < 0 || e > 23) found.hydration = 'Enter hours between 0 and 23.';
      else {
        next.hydration.startHour = s;
        next.hydration.endHour = e;
        found.hydration = validatePrefs(next).hydration;
      }
    }
    if (next.sleep.enabled) {
      if (!isValidTime(sleepText)) found.sleep = 'Use a 24-hour time like 22:00.';
      else {
        next.sleep.hour = Number(sleepText.slice(0, 2));
        next.sleep.minute = Number(sleepText.slice(3, 5));
      }
    }
    return { prefs: next, errors: found };
  }

  async function save() {
    const { prefs: next, errors: found } = currentPrefs();
    setErrors(found);
    setMessage(null);
    if (found.hydration || found.sleep) return;
    setSaving(true);
    try {
      const anyOn = next.hydration.enabled || next.sleep.enabled;
      if (anyOn) {
        let permission = await getReminderPermission();
        if (permission !== 'granted') permission = await requestReminderPermission();
        setBlocked(permission !== 'granted');
        if (permission !== 'granted') {
          setMessage({ kind: 'warning', text: 'Notifications are turned off for HealthPredict on this phone, so reminders can\'t be shown. Your choices were not applied.' });
          return;
        }
      } else setBlocked(false);
      const result = await saveWellnessPrefs(userId, next);
      setPrefs(next);
      setMessage({ kind: 'success', text: anyOn ? `Saved. ${result.scheduled} reminder${result.scheduled === 1 ? '' : 's'} will repeat every day.` : 'Saved. Wellness reminders are off.' });
    } catch {
      setMessage({ kind: 'error', text: 'Could not save your reminders. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  const preview = prefs.hydration.enabled && !errors.hydration && Number.isInteger(Number(startText)) && Number.isInteger(Number(endText))
    ? hydrationHours(Number(startText), Number(endText), prefs.hydration.intervalHours).map((h) => formatClock(h)).join(', ')
    : '';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText color="textMuted">
          Reminders are set on this phone and repeat at fixed times. They don&apos;t know your progress, so a water reminder still appears if you&apos;ve
          already reached your goal. Nothing is sent from a server.
        </AppText>

        {message ? <View style={styles.gap}><Banner kind={message.kind} message={message.text} /></View> : null}
        {blocked ? <Button label="Open phone settings" variant="secondary" onPress={() => void Linking.openSettings()} style={styles.gap} /> : null}

        <Card style={styles.gap}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="h3">Medicine</AppText>
              <AppText variant="caption" color="textMuted">Dose reminders follow your medicine schedule and are managed on the Medicines tab.</AppText>
            </View>
          </View>
          <Button label="Open Medicines" icon="pill" variant="secondary" onPress={() => router.navigate('/medicines')} style={styles.inner} />
        </Card>

        <Card style={styles.gap}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="h3">Hydration</AppText>
              <AppText variant="caption" color="textMuted">A nudge to drink water through the day.</AppText>
            </View>
            <Switch accessibilityLabel="Hydration reminders" value={prefs.hydration.enabled} disabled={!loaded}
              onValueChange={(v) => hydration({ enabled: v })} trackColor={{ true: colors.primaryMid, false: colors.borderStrong }} thumbColor="#FFFFFF" />
          </View>
          {prefs.hydration.enabled ? (
            <View style={styles.inner}>
              <ChipSelect label="How often" options={INTERVALS} value={String(prefs.hydration.intervalHours)} onChange={(v) => hydration({ intervalHours: Number(v) })} />
              <View style={styles.pair}>
                <View style={styles.flex}><TextField label="From (hour, 0-23)" value={startText} onChangeText={setStartText} keyboardType="number-pad" maxLength={2} /></View>
                <View style={styles.flex}><TextField label="Until (hour, 0-23)" value={endText} onChangeText={setEndText} keyboardType="number-pad" maxLength={2} /></View>
              </View>
              {errors.hydration ? <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">{errors.hydration}</AppText> : null}
              {preview ? <AppText variant="caption" color="textSubtle">Reminders at {preview}</AppText> : null}
            </View>
          ) : null}
        </Card>

        <Card style={styles.gap}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="h3">Bedtime</AppText>
              <AppText variant="caption" color="textMuted">A daily nudge to wind down.</AppText>
            </View>
            <Switch accessibilityLabel="Bedtime reminder" value={prefs.sleep.enabled} disabled={!loaded}
              onValueChange={(v) => sleep({ enabled: v })} trackColor={{ true: colors.primaryMid, false: colors.borderStrong }} thumbColor="#FFFFFF" />
          </View>
          {prefs.sleep.enabled ? (
            <View style={styles.inner}>
              <TextField label="Time" leftIcon="clock-outline" value={sleepText} onChangeText={(t) => setSleepText(formatTimeInput(t))} keyboardType="number-pad" maxLength={5} error={errors.sleep} />
            </View>
          ) : null}
        </Card>

        <Button label="Save reminders" icon="content-save-outline" onPress={() => void save()} loading={saving} disabled={!loaded} style={styles.gap} />

        <AppText variant="caption" color="textSubtle" style={styles.gap}>
          These are local notifications. Remote push notifications (sent by a server while the app is closed) are not set up in this app.
        </AppText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  gap: { marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inner: { marginTop: 14 },
  pair: { flexDirection: 'row', gap: 12 },
});
