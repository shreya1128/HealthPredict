import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { PASSWORD_RULES } from '@/utils/validation';

import { AppText } from './AppText';

/** Live view of the backend's password rules, so people know what is required before they submit. */
export function PasswordChecklist({ value }: { value: string }) {
  return (
    <View style={styles.wrap} accessibilityLabel="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <View key={rule.id} style={styles.row}>
            <MaterialCommunityIcons
              name={ok ? 'check-circle' : 'circle-outline'}
              size={16}
              color={ok ? colors.success : colors.placeholder}
            />
            <AppText variant="caption" color={ok ? 'success' : 'textSubtle'} accessibilityLabel={`${rule.label}: ${ok ? 'met' : 'not met'}`}>
              {rule.label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: -4, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
