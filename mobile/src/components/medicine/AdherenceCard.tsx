import { StyleSheet, View } from 'react-native';

import type { Adherence } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { colors } from '@/theme';

/** Adherence exactly as the server computed it from real dose records, with the counts behind the percentage. */
export function AdherenceCard({ adherence, title }: { adherence: Adherence; title: string }) {
  const pct = adherence.adherence_percent;
  return (
    <Card>
      <AppText variant="label" color="textMuted">
        {title}
      </AppText>
      {pct === null || adherence.scheduled_count === 0 ? (
        <AppText color="textMuted" style={styles.empty}>
          No doses were scheduled in this period, so there is nothing to measure yet.
        </AppText>
      ) : (
        <>
          <View style={styles.big} accessible accessibilityLabel={`Adherence ${Math.round(pct)} percent`}>
            <AppText variant="display">{Math.round(pct)}%</AppText>
            <AppText color="textMuted"> taken</AppText>
          </View>
          <ProgressBar value={pct} color={colors.green} label="Adherence" />
          <View style={styles.counts}>
            <Count label="Taken" value={adherence.taken_count} color={colors.success} />
            <Count label="Skipped" value={adherence.skipped_count} color={colors.textMuted} />
            <Count label="Missed" value={adherence.missed_count} color={colors.danger} />
            <Count label="Scheduled" value={adherence.scheduled_count} color={colors.text} />
          </View>
          <AppText variant="caption" color="textSubtle" style={styles.note}>
            Percentage = taken ÷ scheduled. Skipped doses and today&apos;s doses that are still pending count as not taken.
          </AppText>
        </>
      )}
    </Card>
  );
}

function Count({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.count} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="h2" style={{ color }}>
        {value}
      </AppText>
      <AppText variant="caption" color="textSubtle">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { marginTop: 8 },
  big: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4, marginBottom: 10 },
  counts: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  count: { alignItems: 'center', flex: 1 },
  note: { marginTop: 12 },
});
