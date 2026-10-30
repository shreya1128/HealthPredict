import { Link, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { toApiError } from '@/api/errors';
import { useAuth } from '@/auth/AuthContext';
import { AuthScaffold } from '@/components/auth/AuthScaffold';
import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { validateEmail } from '@/utils/validation';

const NOTICES: Record<string, string> = {
  'password-reset': 'Your password was updated. Sign in with your new password.',
  'account-created': 'Your account was created. Please sign in.',
};

export default function Login() {
  const { signIn } = useAuth();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const eErr = validateEmail(email);
    const pErr = password ? null : 'Enter your password';
    setEmailError(eErr);
    setPasswordError(pErr);
    setFormError(null);
    if (eErr || pErr) return;

    setLoading(true);
    try {
      await signIn(email, password); // on success the (auth) layout redirects into the app
    } catch (e) {
      setFormError(toApiError(e).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      title="Welcome back"
      subtitle="Sign in to continue to your health space."
      footer={
        <View style={styles.footer}>
          <AppText color="textMuted">New to HealthPredict? </AppText>
          <Link href="/register" asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <AppText variant="bodyStrong" color="primary">
                Create an account
              </AppText>
            </Pressable>
          </Link>
        </View>
      }
    >
      {notice && NOTICES[notice] ? <Banner kind="success" message={NOTICES[notice]} /> : null}
      {formError ? <Banner kind="error" message={formError} /> : null}

      <TextField
        label="Email"
        leftIcon="email-outline"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        leftIcon="lock-outline"
        password
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        placeholder="Your password"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />

      <Link href="/forgot-password" asChild>
        <Pressable accessibilityRole="link" style={styles.forgot} hitSlop={8}>
          <AppText variant="bodyStrong" color="primary">
            Forgot password?
          </AppText>
        </Pressable>
      </Link>

      <Button label="Sign in" onPress={() => void submit()} loading={loading} />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  forgot: { alignSelf: 'flex-end', marginTop: -6, marginBottom: 20, paddingVertical: 4 },
  footer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginTop: 24 },
});
