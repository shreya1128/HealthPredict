import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors } from '@/theme';
import { DOSE_STATUS_LABEL, type DoseStatus } from '@/utils/medicineDisplay';

const PALETTE: Record<DoseStatus, { fg: string; bg: string }> = {
  taken: { fg: colors.success, bg: colors.successSoft },
  skipped: { fg: colors.textMuted, bg: colors.border },
  missed: { fg: colors.danger, bg: colors.dangerSoft },
  pending: { fg: colors.warning, bg: colors.warningSoft },
  upcoming: { fg: colors.textSubtle, bg: colors.bg },
};

export function StatusPill({ status, label }: { status: DoseStatus | 'active' | 'paused'; label?: string }) {
  const p = status === 'active' ? { fg: colors.success, bg: colors.successSoft } : status === 'paused' ? { fg: colors.warning, bg: colors.warningSoft } : PALETTE[status];
  const text = label ?? (status === 'active' ? 'Active' : status === 'paused' ? 'Paused' : DOSE_STATUS_LABEL[status]);
  return (
    <View style={[styles.pill, { backgroundColor: p.bg }]} accessible accessibilityLabel={`Status: ${text}`}>
      <AppText variant="label" style={{ color: p.fg }}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({ pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 } });
