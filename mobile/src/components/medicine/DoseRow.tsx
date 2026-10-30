import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { ScheduleEntry } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { formatTime } from '@/utils/health';
import { doseStatus } from '@/utils/medicineDisplay';

import { StatusPill } from './StatusPill';

export interface DoseRowProps {
  entry: ScheduleEntry;
  /** Show the medicine name (cross-medicine "today" list). */
  showName?: boolean;
  busy?: boolean;
  onAct: (entry: ScheduleEntry, kind: 'taken' | 'skipped') => void;
}

/**
 * One scheduled dose. Doses due today or earlier can be logged; future ones can't. There is no "undo" in the
 * backend, so a logged dose can only be switched between taken and skipped.
 */
export function DoseRow({ entry, showName, busy, onAct }: DoseRowProps) {
  const status = doseStatus(entry);
  const canLog = status !== 'upcoming';
  const time = formatTime(entry.scheduled_time);
  const name = entry.medicine_name ?? 'Medicine';

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <View style={styles.texts}>
          <AppText variant="bodyStrong">{showName ? name : time || 'Any time'}</AppText>
          {showName ? (
            <AppText variant="caption" color="textSubtle">
              {time || 'Any time'}
            </AppText>
          ) : null}
        </View>
        {busy ? <ActivityIndicator accessibilityLabel="Saving" /> : <StatusPill status={status} />}
      </View>
      {canLog && !busy ? (
        <View style={styles.actions}>
          {status !== 'taken' ? <Button label="Taken" icon="check" style={styles.flex} onPress={() => onAct(entry, 'taken')} accessibilityHint={`Log ${name} at ${time} as taken`} /> : null}
          {status !== 'skipped' ? <Button label={status === 'taken' ? 'Mark skipped' : 'Skip'} variant="secondary" style={styles.flex} onPress={() => onAct(entry, 'skipped')} accessibilityHint={`Log ${name} at ${time} as skipped`} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 10, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  texts: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1, minHeight: 44 },
});
