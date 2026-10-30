import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <AppText variant="overline" color="textSubtle" accessibilityRole="header">
        {title}
      </AppText>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 8, marginHorizontal: 4 },
});
