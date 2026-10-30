import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { AppText } from './AppText';

export const DISCLAIMER_TEXT =
  'HealthPredict is an educational wellness project. Its scores, predictions and suggestions are not a medical diagnosis or treatment. Always consult a qualified healthcare professional.';

export function Disclaimer() {
  return (
    <View style={styles.wrap}>
      <MaterialCommunityIcons name="shield-check-outline" size={18} color={colors.textSubtle} style={styles.icon} />
      <AppText variant="caption" color="textSubtle" style={styles.text}>
        {DISCLAIMER_TEXT}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 8, paddingVertical: 8 },
  icon: { marginTop: 1 },
  text: { flex: 1 },
});
