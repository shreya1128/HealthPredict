import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { healthApi } from '@/api/health';
import type { HistoryPoint } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ErrorState, LoadingView } from '@/components/ui/StateViews';
import { TrendChart } from '@/components/ui/TrendChart';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { colors } from '@/theme';
import { formatDate, formatShortDate } from '@/utils/health';

type Mode = 'trends' | 'timeline' | 'list';
const RANGES = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;
const MODES: { value: Mode; label: string }[] = [
  { value: 'trends', label: 'Trends' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'list', label: 'Assessments' },
];

export default function History() {
  useStatusBarStyle('dark');
  const [mode, setMode] = useState<Mode>('trends');
  const [range, setRange] = useState<'7' | '30' | '90'>('30');

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <SegmentedControl label="View" options={MODES} value={mode} onChange={setMode} />
      {mode === 'trends' ? (
        <>
          <SegmentedControl label="Time range" options={[...RANGES]} value={range} onChange={setRange} />
          <TrendsPanel days={Number(range)} />
        </>
      ) : mode === 'timeline' ? (
        <TimelinePanel />
      ) : (
        <AssessmentsPanel />
      )}
    </ScrollView>
  );
}

function TimelinePanel() {
  const { data, loading, error, reload } = useApiQuery<{ total_events: number; events: any[] }>(
    () => healthApi.timeline({ limit: 30 }),
    'timeline_30'
  );

  if (loading && !data) return <LoadingView label="Loading timeline..." />;
  if (error && !data) return <ErrorState error={error} onRetry={() => void reload()} />;
  if (!data || data.events.length === 0) {
    return (
      <EmptyState
        icon="clock-outline"
        title="No timeline events yet"
        message="Complete a health assessment or log your daily sleep, exercise, or hydration to see your health timeline."
      />
    );
  }

  return (
    <View style={styles.stack}>
      <AppText variant="caption" color="textSubtle">
        Showing latest {data.events.length} chronological events across all health streams
      </AppText>
      {data.events.map((e) => {
        const d = new Date(e.timestamp);
        return (
          <Card key={e.id} style={styles.timelineCard}>
            <View style={styles.timelineHeader}>
              <View style={styles.badgeRow}>
                <AppText variant="caption" color="primary">
                  {e.category}
                </AppText>
                <AppText variant="caption" color="textSubtle">
                  • {e.data_source.replace(/_/g, ' ')}
                </AppText>
              </View>
              <AppText variant="caption" color="textSubtle">
                {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </AppText>
            </View>
            <AppText variant="bodyStrong">{e.title}</AppText>
            {e.values && Object.keys(e.values).length > 0 ? (
              <View style={styles.valuesBox}>
                {Object.entries(e.values).map(([k, v]) => (
                  <AppText key={k} variant="caption" color="text">
                    <AppText variant="caption" color="textSubtle">{k.replace(/_/g, ' ')}: </AppText>
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </AppText>
                ))}
              </View>
            ) : null}
            {e.notes ? (
              <AppText variant="caption" color="textSubtle" style={{ fontStyle: 'italic', marginTop: 4 }}>
                &quot;{e.notes}&quot;
              </AppText>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const col = (points: HistoryPoint[], pick: (p: HistoryPoint) => number | null) => points.map(pick);
const hasData = (values: (number | null)[]) => values.some((v) => v !== null);

function TrendsPanel({ days }: { days: number }) {
  const router = useRouter();
  const { data, error, loading, refreshing, reload } = useApiQuery(() => healthApi.history(days), days);

  if (loading) return <LoadingView label="Loading trends…" />;
  if (error) return <ErrorState error={error} onRetry={() => void reload()} />;
  if (!data) return null;

  if (data.points.length === 0) {
    return (
      <EmptyState
        icon="chart-line"
        title="No data in this period"
        message={`You haven't recorded an assessment in the last ${days} days. Record one and your trends will appear here.`}
        actionLabel="New assessment"
        onAction={() => router.push('/assessment/new')}
      />
    );
  }

  const labels = data.points.map((p) => formatShortDate(p.tracking_date));
  const charts: { title: string; unit?: string; series: { name: string; color: string; values: (number | null)[] }[] }[] = [
    { title: 'Health score', unit: '/ 100', series: [{ name: 'Score', color: colors.primary, values: col(data.points, (p) => p.health_score) }] },
    {
      title: 'Blood pressure',
      unit: 'mmHg',
      series: [
        { name: 'Systolic', color: colors.danger, values: col(data.points, (p) => p.systolic_bp) },
        { name: 'Diastolic', color: colors.accent, values: col(data.points, (p) => p.diastolic_bp) },
      ],
    },
    { title: 'Heart rate', unit: 'bpm', series: [{ name: 'Heart rate', color: colors.danger, values: col(data.points, (p) => p.heart_rate_bpm) }] },
    { title: 'Blood glucose', unit: 'mg/dL', series: [{ name: 'Glucose', color: colors.warning, values: col(data.points, (p) => p.blood_glucose_mg_dl) }] },
    { title: 'Oxygen saturation', unit: '%', series: [{ name: 'SpO2', color: colors.blue, values: col(data.points, (p) => p.spo2_percent) }] },
    { title: 'Weight', unit: 'kg', series: [{ name: 'Weight', color: colors.green, values: col(data.points, (p) => p.weight_kg) }] },
    { title: 'BMI', series: [{ name: 'BMI', color: colors.accent, values: col(data.points, (p) => p.bmi) }] },
  ];
  const visible = charts.filter((c) => c.series.some((s) => hasData(s.values)));

  return (
    <View style={styles.stack}>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh trends" onPress={() => void reload()} style={styles.refresh}>
        <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </AppText>
      </Pressable>
      {visible.map((c) => (
        <Card key={c.title}>
          <TrendChart title={c.title} unit={c.unit} series={c.series.filter((s) => hasData(s.values))} labels={labels} />
        </Card>
      ))}
      <AppText variant="caption" color="textSubtle">
        Charts show the days you recorded measurements. A gap means nothing was recorded that day, not that the value was zero.
      </AppText>
    </View>
  );
}

const PAGE_STEP = 20;
const MAX_PAGE_SIZE = 100; // backend limit

function AssessmentsPanel() {
  const router = useRouter();
  const [size, setSize] = useState(PAGE_STEP);
  const { data, error, loading, reload } = useApiQuery(() => healthApi.list(1, size), size);

  if (loading) return <LoadingView label="Loading assessments…" />;
  if (error) return <ErrorState error={error} onRetry={() => void reload()} />;
  if (!data) return null;

  if (data.items.length === 0) {
    return (
      <EmptyState
        icon="clipboard-text-outline"
        title="No assessments yet"
        message="Your saved assessments will be listed here."
        actionLabel="New assessment"
        onAction={() => router.push('/assessment/new')}
      />
    );
  }

  const canLoadMore = data.items.length < data.total && size < MAX_PAGE_SIZE;
  return (
    <View style={styles.stack}>
      <AppText variant="caption" color="textSubtle">
        Showing {data.items.length} of {data.total}
      </AppText>
      {data.items.map((a) => (
        <Pressable
          key={a.id}
          accessibilityRole="button"
          accessibilityLabel={`Assessment on ${formatDate(a.assessment_date)}, score ${a.health_score ?? 'not available'}`}
          onPress={() => router.push({ pathname: '/assessment/[id]', params: { id: String(a.id) } })}
          style={({ pressed }) => pressed && { opacity: 0.7 }}
        >
          <Card style={styles.row}>
            <View style={styles.rowText}>
              <AppText variant="bodyStrong">{formatDate(a.assessment_date)}</AppText>
              <RiskBadge category={a.risk_category} />
            </View>
            <AppText variant="h1">{a.health_score === null ? '—' : Math.round(a.health_score)}</AppText>
          </Card>
        </Pressable>
      ))}
      {canLoadMore ? <Button label="Load more" variant="secondary" onPress={() => setSize((s) => Math.min(s + PAGE_STEP, MAX_PAGE_SIZE))} /> : null}
      {data.items.length < data.total && !canLoadMore ? (
        <AppText variant="caption" color="textSubtle">
          Showing your {MAX_PAGE_SIZE} most recent assessments.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  stack: { gap: 14 },
  refresh: { alignSelf: 'flex-end', paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText: { gap: 6 },
  timelineCard: { gap: 6, paddingVertical: 12 },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgeRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  valuesBox: { backgroundColor: colors.surface, padding: 8, borderRadius: 6, gap: 2, marginTop: 4 },
});
