import { StyleSheet, View } from 'react-native';

import type { Assessment } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { Divider, ListRow } from '@/components/ui/ListRow';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { colors } from '@/theme';
import { formatDate, riskPalette } from '@/utils/health';

import { PredictionCard } from './PredictionCard';

function measurements(a: Assessment) {
  const rows: { icon: React.ComponentProps<typeof ListRow>['icon']; title: string; value: string }[] = [];
  if (a.systolic_bp !== null && a.diastolic_bp !== null) rows.push({ icon: 'heart-pulse', title: 'Blood pressure', value: `${a.systolic_bp}/${a.diastolic_bp} mmHg` });
  if (a.heart_rate_bpm !== null) rows.push({ icon: 'heart', title: 'Heart rate', value: `${a.heart_rate_bpm} bpm` });
  if (a.blood_glucose_mg_dl !== null) rows.push({ icon: 'water-percent', title: 'Blood glucose', value: `${a.blood_glucose_mg_dl} mg/dL` });
  if (a.spo2_percent !== null) rows.push({ icon: 'lungs', title: 'SpO2', value: `${a.spo2_percent}%` });
  if (a.temperature_celsius !== null) rows.push({ icon: 'thermometer', title: 'Temperature', value: `${a.temperature_celsius} °C` });
  return rows;
}

/** Full read-out of one assessment: score + why, the vitals used, and the AI estimate with its explanation. */
export function AssessmentResult({ assessment: a }: { assessment: Assessment }) {
  const palette = riskPalette(a.risk_category);
  const rows = measurements(a);
  const components = [...(a.score_breakdown?.components ?? [])].sort((x, y) => y.weight_pct - x.weight_pct);
  const skipped = a.score_breakdown?.skipped ?? [];

  return (
    <View>
      <Card style={styles.hero}>
        <ScoreGauge score={a.health_score} color={palette.fg} />
        <View style={styles.heroText}>
          <AppText variant="h2">Health score</AppText>
          <RiskBadge category={a.risk_category} />
          <AppText variant="caption" color="textSubtle">
            {formatDate(a.assessment_date)}
          </AppText>
        </View>
      </Card>

      {a.data_completeness_percent !== null ? (
        <View style={styles.completeness}>
          <AppText variant="caption" color="textMuted">
            Based on {Math.round(a.data_completeness_percent)}% of the information the score can use
          </AppText>
          <ProgressBar value={a.data_completeness_percent} label="Data completeness" height={6} />
        </View>
      ) : null}

      {a.glucose_caveat ? <View style={styles.banner}><Banner kind="warning" message={a.glucose_caveat} /></View> : null}
      {a.profile_hints.length > 0 ? <View style={styles.banner}><Banner kind="info" message={a.profile_hints.join(' ')} /></View> : null}

      {components.length > 0 ? (
        <>
          <SectionHeader title="Why this score" />
          <Card>
            <AppText variant="caption" color="textSubtle" style={styles.explain}>
              The score combines these parts. Each is rated 0–100, and its weight shows how much it counts.
            </AppText>
            {components.map((c, i) => (
              <View key={c.key} style={[styles.component, i > 0 && styles.componentGap]}>
                <View style={styles.componentHead}>
                  <AppText variant="bodyStrong">{c.label}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {c.score}/100 · counts {Math.round(c.weight_pct)}%
                  </AppText>
                </View>
                <ProgressBar value={c.score} label={`${c.label} ${c.score} out of 100`} />
              </View>
            ))}
            {skipped.length > 0 ? (
              <View style={styles.skipped}>
                <AppText variant="label" color="textMuted">
                  Not included
                </AppText>
                {skipped.map((s) => (
                  <AppText key={s.key} variant="caption" color="textSubtle">
                    {s.label}: {s.reason}
                  </AppText>
                ))}
              </View>
            ) : null}
          </Card>
        </>
      ) : null}

      <SectionHeader title="AI risk estimate" />
      <PredictionCard prediction={a.ml_prediction} missingFields={a.ml_prediction_missing_fields} />

      {rows.length > 0 ? (
        <>
          <SectionHeader title="Measurements" />
          <Card>
            {rows.map((r, i) => (
              <View key={r.title}>
                {i > 0 ? <Divider /> : null}
                <ListRow icon={r.icon} title={r.title} value={r.value} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {a.assessment_notes ? (
        <>
          <SectionHeader title="Your notes" />
          <Card>
            <AppText>{a.assessment_notes}</AppText>
          </Card>
        </>
      ) : null}

      <View style={styles.footer}>
        <Disclaimer />
        <AppText variant="caption" color="textSubtle">
          {a.disclaimer}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  heroText: { flex: 1, gap: 8 },
  completeness: { marginTop: 12, marginHorizontal: 4, gap: 6 },
  banner: { marginTop: 12 },
  explain: { marginBottom: 14 },
  component: { gap: 6 },
  componentGap: { marginTop: 14 },
  componentHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  skipped: { marginTop: 18, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 4 },
  footer: { marginTop: 24, gap: 6 },
});
