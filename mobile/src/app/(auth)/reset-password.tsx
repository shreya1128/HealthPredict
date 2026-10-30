import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { authApi } from '@/api/auth';
import { toApiError } from '@/api/errors';
import { AuthScaffold } from '@/components/auth/AuthScaffold';
import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { PasswordChecklist } from '@/components/ui/PasswordChecklist';
import { TextField } from '@/components/ui/TextField';
import { validatePassword } from '@/utils/validation';

/** Reachable by deep link (healthpredict://reset-password?token=...) or by pasting the token manually. */
export default function ResetPassword() {
  const router = useRouter();
  const { token: tokenParam } = useLocalSearchParams<{ token?: string }>();
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const [token, setToken] = useState(typeof tokenParam === 'string' ? tokenParam : '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ token?: string; password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const next: typeof errors = {};
    if (!token.trim()) next.token = 'Enter the reset token from your email';
    const pwErr = validatePassword(password);
    if (pwErr) next.password = pwErr;
    if (!confirm) next.confirm = 'Re-enter your new password';
    else if (confirm !== password) next.confirm = 'Passwords do not match';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      await authApi.resetPassword(token, password, confirm);
      router.replace({ pathname: '/login', params: { notice: 'password-reset' } });
    } catch (e) {
      setFormError(toApiError(e).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      title="Choose a new password"
      subtitle="Enter your reset token and a new password."
      footer={
        <Pressable accessibilityRole="link" onPress={() => router.replace('/login')} style={styles.back} hitSlop={8}>
          <AppText variant="bodyStrong" color="primary">
            Back to sign in
          </AppText>
        </Pressable>
      }
    >
      {formError ? <Banner kind="error" message={formError} /> : null}

      <TextField
        label="Reset token"
        leftIcon="key-outline"
        value={token}
        onChangeText={setToken}
        error={errors.token}
        placeholder="Paste your token"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="New password"
        leftIcon="lock-outline"
        password
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        placeholder="Create a new password"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <PasswordChecklist value={password} />
      <TextField
        ref={confirmRef}
        label="Confirm new password"
        leftIcon="lock-check-outline"
        password
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm}
        placeholder="Re-enter your new password"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <Button label="Update password" onPress={() => void submit()} loading={loading} />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'center', marginTop: 20, paddingVertical: 8 },
});
