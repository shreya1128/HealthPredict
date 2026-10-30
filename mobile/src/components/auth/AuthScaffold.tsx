import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Logo } from '@/components/ui/Logo';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { colors, gradients, radius } from '@/theme';

export interface AuthScaffoldProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Shared frame for sign-in / register / password screens: brand header + white form sheet. */
export function AuthScaffold({ title, subtitle, children, footer }: AuthScaffoldProps) {
  useStatusBarStyle('light');
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.hero} style={StyleSheet.absoluteFill} />
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Logo size={48} variant="white" />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AppText variant="h1">{title}</AppText>
          {subtitle ? (
            <AppText color="textMuted" style={styles.subtitle}>
              {subtitle}
            </AppText>
          ) : null}
          <View style={styles.form}>{children}</View>
          {footer}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary },
  flex: { flex: 1 },
  header: { alignItems: 'center', paddingBottom: 24 },
  sheet: { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl },
  sheetContent: { padding: 24 },
  subtitle: { marginTop: 6 },
  form: { marginTop: 22 },
});
