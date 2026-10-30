import { StyleSheet, View } from 'react-native';

import { riskPalette } from '@/utils/health';

import { AppText } from './AppText';

export function RiskBadge({ category, prefix }: { category: string | null | undefined; prefix?: string }) {
  const p = riskPalette(category);
  return (
    <View style={[styles.badge, { backgroundColor: p.bg }]} accessible accessibilityLabel={`${prefix ? prefix + ' ' : ''}${p.label}`}>
      <View style={[styles.dot, { backgroundColor: p.fg }]} />
      <AppText variant="label" style={{ color: p.fg }}>
        {p.label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
