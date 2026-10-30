import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '@/theme';

import { AppText } from './AppText';

export interface ScoreGaugeProps {
  /** 0-100, or null when no score exists. */
  score: number | null;
  /** Ring colour; callers derive it from the backend's risk category. */
  color: string;
  size?: number;
  caption?: string;
}

/** Circular progress ring with the number in the middle. Shows an em dash, never a made-up number, when there is no score. */
export function ScoreGauge({ score, color, size = 148, caption = 'out of 100' }: ScoreGaugeProps) {
  const stroke = Math.max(10, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fraction = score === null ? 0 : Math.min(Math.max(score, 0), 100) / 100;

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityLabel={score === null ? 'Health score not available' : `Health score ${Math.round(score)} out of 100`}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
        {fraction > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * fraction} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <AppText variant="display" style={{ fontSize: size * 0.3, lineHeight: size * 0.34 }}>
          {score === null ? '—' : Math.round(score)}
        </AppText>
        <AppText variant="caption" color="textSubtle">
          {caption}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
