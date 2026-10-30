import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

import { AppText } from './AppText';

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string | null;
  hint?: string;
}

export function SegmentedControl<T extends string>({ label, options, value, onChange, error, hint }: SegmentedControlProps<T>) {
  return (
    <View style={styles.wrapper}>
      <AppText variant="label" color="textMuted" style={styles.label}>
        {label}
      </AppText>
      <View style={[styles.track, !!error && styles.errored]} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(o.value)}
              style={[styles.segment, selected && styles.selected]}
            >
              <AppText variant="bodyStrong" color={selected ? 'onPrimary' : 'textMuted'}>
                {o.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" style={styles.message} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="textSubtle" style={styles.message}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { marginBottom: 6 },
  track: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radius.md, padding: 4, borderWidth: 1.5, borderColor: colors.border },
  errored: { borderColor: colors.danger },
  segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  selected: { backgroundColor: colors.primary },
  message: { marginTop: 6 },
});
