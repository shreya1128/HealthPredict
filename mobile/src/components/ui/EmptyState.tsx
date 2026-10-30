import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <MaterialCommunityIcons name={icon} size={40} color={colors.primary} />
      </View>
      <AppText variant="h2" center style={styles.title}>
        {title}
      </AppText>
      <AppText color="textMuted" center style={styles.message}>
        {message}
      </AppText>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 48 },
  badge: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { marginBottom: 8 },
  message: { maxWidth: 320 },
  action: { marginTop: 20, alignSelf: 'stretch' },
});
