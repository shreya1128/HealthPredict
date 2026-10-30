import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { colors, radius } from '@/theme';
import { formatTimeInput } from '@/utils/medicineForm';

const PRESETS = [
  { label: 'Morning', time: '08:00' },
  { label: 'Afternoon', time: '14:00' },
  { label: 'Evening', time: '20:00' },
  { label: 'Bedtime', time: '22:00' },
];

export interface TimeListFieldProps {
  times: string[];
  onChange: (times: string[]) => void;
  /** Maximum number of times for the chosen frequency. */
  max: number;
  error?: string | null;
  hint?: string;
}

/** Dose times as 24-hour HH:MM entries (typing "0830" becomes "08:30"), with quick presets. */
export function TimeListField({ times, onChange, max, error, hint }: TimeListFieldProps) {
  const update = (i: number, raw: string) => onChange(times.map((t, idx) => (idx === i ? formatTimeInput(raw) : t)));
  const remove = (i: number) => onChange(times.filter((_, idx) => idx !== i));
  const addPreset = (t: string) => {
    if (times.includes(t)) return;
    onChange(max === 1 ? [t] : times.length < max ? [...times, t] : times);
  };

  return (
    <View style={styles.wrap}>
      <AppText variant="label" color="textMuted" style={styles.label}>
        {max === 1 ? 'Dose time' : 'Dose times'}
      </AppText>
      {times.map((t, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.flex}>
            <TextField label={`Time ${i + 1}`} leftIcon="clock-outline" value={t} onChangeText={(v) => update(i, v)} placeholder="08:00" keyboardType="number-pad" maxLength={5} />
          </View>
          {times.length > 1 || max > 1 ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove time ${i + 1}`} onPress={() => remove(i)} style={styles.remove} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle-outline" size={26} color={colors.textSubtle} />
            </Pressable>
          ) : null}
        </View>
      ))}
      <View style={styles.presets}>
        {PRESETS.map((p) => (
          <Pressable key={p.time} accessibilityRole="button" accessibilityLabel={`Use ${p.label} ${p.time}`} onPress={() => addPreset(p.time)} style={styles.preset}>
            <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
              {p.label} {p.time}
            </AppText>
          </Pressable>
        ))}
      </View>
      {max > 1 && times.length < max ? <Button label="Add another time" icon="plus" variant="ghost" onPress={() => onChange([...times, ''])} /> : null}
      {error ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="textSubtle">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: { marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flex: { flex: 1 },
  remove: { marginTop: 28 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  preset: { paddingHorizontal: 12, minHeight: 36, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.primarySoft },
});
