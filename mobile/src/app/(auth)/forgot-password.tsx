import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { authApi } from '@/api/auth';
import { toApiError } from '@/api/errors';
import { AuthScaffold } from '@/components/auth/AuthScaffold';
import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { validateEmail } from '@/utils/validation';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const err = validateEmail(email);
    setEmailError(err);
    setFormError(null);
    if (err) return;

    setLoading(true);
    try {
      setSentMessage(await authApi.forgotPassword(email));
    } catch (e) {
      setFormError(toApiError(e).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      title="Reset your password"
      subtitle="Enter your account email and we'll start the reset."
      footer={
        <Pressable accessibilityRole="link" onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <AppText variant="bodyStrong" color="primary">
            Back to sign in
          </AppText>
        </Pressable>
      }
    >
      {formError ? <Banner kind="error" message={formError} /> : null}
      {sentMessage ? <Banner kind="success" message={sentMessage} /> : null}
      {__DEV__ ? (
        <Banner
          kind="info"
          message="Development build: email delivery isn't set up yet. The reset token is printed in the backend console; copy it into the next screen."
        />
      ) : null}

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
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <Button label={sentMessage ? 'Send again' : 'Send reset instructions'} onPress={() => void submit()} loading={loading} />

      <View style={styles.have}>
        <Button label="I already have a reset token" variant="ghost" onPress={() => router.push('/reset-password')} />
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'center', marginTop: 20, paddingVertical: 8 },
  have: { marginTop: 8 },
});
