import { Link, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { toApiError } from '@/api/errors';
import type { Gender } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { AuthScaffold } from '@/components/auth/AuthScaffold';
import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { PasswordChecklist } from '@/components/ui/PasswordChecklist';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { formatDateInput, validateDateOfBirth, validateEmail, validateFullName, validatePassword } from '@/utils/validation';

type Errors = Partial<Record<'full_name' | 'email' | 'gender' | 'date_of_birth' | 'password' | 'confirm_password', string>>;

const FIELDS = ['full_name', 'email', 'gender', 'date_of_birth', 'password', 'confirm_password'] as const;

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
  { value: 'OTHER', label: 'Other' },
];

export default function Register() {
  const { signUp } = useAuth();
  const router = useRouter();
  const emailRef = useRef<TextInput>(null);
  const dobRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [dob, setDob] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    const next: Errors = {};
    const nameErr = validateFullName(fullName);
    if (nameErr) next.full_name = nameErr;
    const emailErr = validateEmail(email);
    if (emailErr) next.email = emailErr;
    if (!gender) next.gender = 'Select one option';
    const dobErr = validateDateOfBirth(dob);
    if (dobErr) next.date_of_birth = dobErr;
    const pwErr = validatePassword(password);
    if (pwErr) next.password = pwErr;
    if (!confirm) next.confirm_password = 'Re-enter your password';
    else if (confirm !== password) next.confirm_password = 'Passwords do not match';

    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0 || !gender) return;

    setLoading(true);
    let detectedTz = 'UTC';
    try {
      detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      detectedTz = 'UTC';
    }
    try {
      const { autoSignedIn } = await signUp({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        confirm_password: confirm,
        gender,
        date_of_birth: dob.trim() || null,
        timezone: detectedTz,
      });
      if (!autoSignedIn) router.replace({ pathname: '/login', params: { notice: 'account-created' } });
      // otherwise the (auth) layout redirects into the app
    } catch (e) {
      const err = toApiError(e);
      // Show server-side field messages next to their fields; anything else goes in the banner.
      const serverFields: Errors = {};
      let placed = false;
      for (const [field, message] of Object.entries(err.fieldErrors)) {
        if ((FIELDS as readonly string[]).includes(field)) {
          serverFields[field as keyof Errors] = message;
          placed = true;
        }
      }
      setErrors(serverFields);
      setFormError(placed ? null : err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      title="Create your account"
      subtitle="It takes a minute. Your details help personalise your health insights."
      footer={
        <View style={styles.footer}>
          <AppText color="textMuted">Already registered? </AppText>
          <Link href="/login" asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <AppText variant="bodyStrong" color="primary">
                Sign in
              </AppText>
            </Pressable>
          </Link>
        </View>
      }
    >
      {formError ? <Banner kind="error" message={formError} /> : null}

      <TextField
        label="Full name"
        leftIcon="account-outline"
        value={fullName}
        onChangeText={setFullName}
        error={errors.full_name}
        placeholder="Your full name"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <TextField
        ref={emailRef}
        label="Email"
        leftIcon="email-outline"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => dobRef.current?.focus()}
      />
      <SegmentedControl
        label="Gender"
        options={GENDERS}
        value={gender}
        onChange={setGender}
        error={errors.gender}
        hint="Health risk prediction currently supports Female and Male only."
      />
      <TextField
        ref={dobRef}
        label="Date of birth (optional)"
        leftIcon="calendar-outline"
        value={dob}
        onChangeText={(t) => setDob(formatDateInput(t))}
        error={errors.date_of_birth}
        hint="Format: YYYY-MM-DD. Used to work out your age."
        placeholder="1990-03-15"
        keyboardType="number-pad"
        maxLength={10}
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
        error={errors.password}
        placeholder="Create a password"
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
        label="Confirm password"
        leftIcon="lock-check-outline"
        password
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm_password}
        placeholder="Re-enter your password"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />

      <Button label="Create account" onPress={() => void submit()} loading={loading} />
      <AppText variant="caption" color="textSubtle" center style={styles.legal}>
        By continuing you acknowledge that HealthPredict is for education and wellness and does not provide medical advice.
      </AppText>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginTop: 24 },
  legal: { marginTop: 14 },
});
