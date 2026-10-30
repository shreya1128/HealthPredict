import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

import { AppText } from './AppText';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface ListRowProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  /** Right-aligned value text (for read-only info rows). */
  value?: string;
  badge?: string;
  tint?: 'primary' | 'accent' | 'blue' | 'green';
  onPress?: () => void;
}

const TINTS = {
  primary: { bg: colors.primarySoft, fg: colors.primary },
  accent: { bg: colors.accentSoft, fg: colors.accent },
  blue: { bg: colors.blueSoft, fg: colors.blue },
  green: { bg: colors.greenSoft, fg: colors.green },
} as const;

export function ListRow({ icon, title, subtitle, value, badge, tint = 'primary', onPress }: ListRowProps) {
  const t = TINTS[tint];
  const content = (
    <View style={styles.row}>
      <View style={[styles.iconBox, { backgroundColor: t.bg }]}>
        <MaterialCommunityIcons name={icon} size={22} color={t.fg} />
      </View>
      <View style={styles.texts}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" color="textSubtle">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="caption" color="textMuted" style={styles.value} numberOfLines={1}>
          {value}
        </AppText>
      ) : null}
      {badge ? (
        <View style={styles.badge}>
          <AppText variant="caption" color="textSubtle" style={styles.badgeText}>
            {badge}
          </AppText>
        </View>
      ) : null}
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={22} color={colors.placeholder} /> : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title} onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {content}
    </Pressable>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 6 },
  iconBox: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1 },
  value: { maxWidth: '45%' },
  badge: { backgroundColor: colors.bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 54 },
});
