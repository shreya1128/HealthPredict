import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

import { AppText } from './AppText';

export interface ChipSelectProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  hint?: string;
  error?: string | null;
}

/** Wrapping single-choice chips: better than a segmented bar when there are 4+ options with longer labels. */
export function ChipSelect<T extends string>({ label, options, value, onChange, hint, error }: ChipSelectProps<T>) {
  return (
    <View style={styles.wrapper}>
      <AppText variant="label" color="textMuted" style={styles.label}>
        {label}
      </AppText>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(o.value)}
              style={[styles.chip, selected && styles.selected]}
            >
              <AppText variant="bodyStrong" color={selected ? 'onPrimary' : 'textMuted'}>
                {o.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" style={styles.msg}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="textSubtle" style={styles.msg}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  msg: { marginTop: 6 },
});
