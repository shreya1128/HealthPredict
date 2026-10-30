import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

export interface ProgressBarProps {
  /** 0-100; values outside are clamped. */
  value: number;
  color?: string;
  height?: number;
  label?: string;
}

export function ProgressBar({ value, color = colors.primaryMid, height = 8, label }: ProgressBarProps) {
  const pct = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 100);
  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2 }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
    >
      <View style={{ width: `${pct}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.border, overflow: 'hidden' },
});
