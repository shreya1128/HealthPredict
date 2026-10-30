import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

import { AppText } from './AppText';

type Kind = 'error' | 'success' | 'info' | 'warning';

const CONFIG = {
  error: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle-outline' },
  success: { bg: colors.successSoft, fg: colors.success, icon: 'check-circle-outline' },
  info: { bg: colors.infoSoft, fg: colors.info, icon: 'information-outline' },
  warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'alert-outline' },
} as const;

export function Banner({ kind = 'info', message }: { kind?: Kind; message: string }) {
  const c = CONFIG[kind];
  return (
    <View
      style={[styles.box, { backgroundColor: c.bg }]}
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={kind === 'error' ? 'assertive' : 'polite'}
    >
      <MaterialCommunityIcons name={c.icon} size={20} color={c.fg} style={styles.icon} />
      <AppText variant="caption" style={[styles.text, { color: c.fg }]}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: radius.md, marginBottom: 16 },
  icon: { marginTop: 1 },
  text: { flex: 1, lineHeight: 19, fontWeight: '500' },
});
