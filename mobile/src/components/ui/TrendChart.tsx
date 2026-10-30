import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { colors } from '@/theme';
import { buildChart, niceLabel, type ChartSeries } from '@/utils/chart';

import { AppText } from './AppText';

export interface TrendChartProps {
  title: string;
  unit?: string;
  series: ChartSeries[];
  /** One label per x position (e.g. formatted dates). Only first and last are drawn. */
  labels: string[];
  height?: number;
}

const PAD = { left: 40, right: 12, top: 10, bottom: 24 };

/** Dependency-free line chart. Gaps in the data stay gaps. */
export function TrendChart({ title, unit, series, labels, height = 170 }: TrendChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const g = width > 0 ? buildChart(series, labels.length, width, height, PAD) : null;
  const last = series.map((s) => [...s.values].reverse().find((v): v is number => v !== null));

  return (
    <View
      accessible
      accessibilityLabel={`${title} chart. ${series.map((s, i) => `${s.name} latest ${last[i] ?? 'none'}`).join(', ')}${unit ? ' ' + unit : ''}`}
    >
      <View style={styles.header}>
        <AppText variant="h3">{title}</AppText>
        <View style={styles.legend}>
          {series.map((s, i) => (
            <View key={s.name} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <AppText variant="caption" color="textMuted">
                {series.length > 1 ? `${s.name} ` : ''}
                <AppText variant="caption" color="text" style={{ fontWeight: '700' }}>
                  {last[i] !== undefined ? niceLabel(last[i]) : '—'}
                </AppText>
                {unit && series.length === 1 ? ` ${unit}` : ''}
              </AppText>
            </View>
          ))}
        </View>
      </View>
      <View onLayout={onLayout} style={{ height }}>
        {g ? (
          <Svg width={width} height={height}>
            {g.ticks.map((t, i) => (
              <Line key={`l${i}`} x1={PAD.left} x2={width - PAD.right} y1={t.y} y2={t.y} stroke={colors.border} strokeWidth={1} strokeDasharray="3 4" />
            ))}
            {g.ticks.map((t, i) => (
              <SvgText key={`t${i}`} x={PAD.left - 6} y={t.y + 4} fontSize={10} fill={colors.textSubtle} textAnchor="end">
                {niceLabel(t.value)}
              </SvgText>
            ))}
            {g.series.map((s) =>
              s.paths.map((d, i) => <Path key={`${s.name}${i}`} d={d} stroke={s.color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />),
            )}
            {g.series.map((s) => s.dots.map((p, i) => <Circle key={`${s.name}d${i}`} cx={p.x} cy={p.y} r={labels.length > 20 ? 2.5 : 4} fill={colors.surface} stroke={s.color} strokeWidth={2} />))}
            {labels.length > 0 ? (
              <SvgText x={PAD.left} y={height - 6} fontSize={10} fill={colors.textSubtle} textAnchor="start">
                {labels[0]}
              </SvgText>
            ) : null}
            {labels.length > 1 ? (
              <SvgText x={width - PAD.right} y={height - 6} fontSize={10} fill={colors.textSubtle} textAnchor="end">
                {labels[labels.length - 1]}
              </SvgText>
            ) : null}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 8, gap: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
});
