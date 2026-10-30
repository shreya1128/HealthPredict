import { useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { toApiError } from '@/api/errors';
import { profileApi } from '@/api/profile';
import type { AlcoholConsumption, CholesterolLevel, ExerciseFrequency, Gender, HealthProfile, SmokingStatus } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ErrorState, LoadingView } from '@/components/ui/StateViews';
import { TextField } from '@/components/ui/TextField';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useSafeBack } from '@/hooks/useSafeBack';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { colors } from '@/theme';
import { buildProfileChanges, formFromProfile, type ProfileErrors, type ProfileForm } from '@/utils/profileForm';
import { formatDateInput } from '@/utils/validation';

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
  { value: 'OTHER', label: 'Other' },
];
const EXERCISE: { value: ExerciseFrequency; label: string }[] = [
  { value: 'SEDENTARY', label: 'Rarely' },
  { value: 'LIGHT', label: 'Light' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'VERY_ACTIVE', label: 'Very active' },
];
const SMOKING: { value: SmokingStatus; label: string }[] = [
  { value: 'NEVER', label: 'Never' },
  { value: 'FORMER', label: 'Former' },
  { value: 'CURRENT', label: 'Current' },
];
const ALCOHOL: { value: AlcoholConsumption; label: string }[] = [
  { value: 'NEVER', label: 'Never' },
  { value: 'OCCASIONALLY', label: 'Occasionally' },
  { value: 'REGULARLY', label: 'Regularly' },
  { value: 'HEAVILY', label: 'Heavily' },
];
const CHOLESTEROL: { value: CholesterolLevel; label: string }[] = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'ABOVE_NORMAL', label: 'Above normal' },
  { value: 'WELL_ABOVE_NORMAL', label: 'Well above normal' },
];

export default function HealthProfileScreen() {
  useStatusBarStyle('dark');
  const { data, error, loading, reload } = useApiQuery(() => profileApi.get());

  if (loading) return <LoadingView label="Loading your profile…" />;
  if (error) return <ErrorState error={error} onRetry={() => void reload()} />;
  return data ? <Editor profile={data} /> : null;
}

function Editor({ profile }: { profile: HealthProfile }) {
  const goBack = useSafeBack('/health');
  const { refreshUser } = useAuth();
  const [form, setForm] = useState<ProfileForm>(() => formFromProfile(profile));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const weightRef = useRef<TextInput>(null);
  const waistRef = useRef<TextInput>(null);
  const sleepRef = useRef<TextInput>(null);

  const set = <K extends keyof ProfileForm>(key: K) => (value: ProfileForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const num = { keyboardType: 'decimal-pad' as const, autoCorrect: false, returnKeyType: 'next' as const };

  async function save() {
    const { changes, errors: found } = buildProfileChanges(profile, form);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;
    if (Object.keys(changes).length === 0) {
      goBack();
      return;
    }
    setSaving(true);
    try {
      await profileApi.update(changes);
      await refreshUser().catch(() => undefined); // gender / date of birth live on the account record
      goBack();
    } catch (e) {
      setServerError(toApiError(e).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText color="textMuted">
          Your health score and AI heart-risk estimate use these details. Only real information is used, and anything you leave blank is simply left out.
        </AppText>

        <View style={styles.form}>
          {serverError ? <Banner kind="error" message={serverError} /> : null}

          <AppText variant="overline" color="textSubtle" style={styles.group}>About you</AppText>
          <SegmentedControl
            label="Gender"
            options={GENDERS}
            value={form.gender}
            onChange={set('gender')}
            hint="The AI estimate currently supports Female and Male only."
          />
          <TextField
            label="Date of birth"
            leftIcon="calendar-outline"
            value={form.dob}
            onChangeText={(t) => set('dob')(formatDateInput(t))}
            error={errors.dob}
            placeholder="1990-03-15"
            hint="YYYY-MM-DD"
            keyboardType="number-pad"
            maxLength={10}
          />
          <TextField
            label="Timezone"
            leftIcon="clock-outline"
            value={form.timezone}
            onChangeText={set('timezone')}
            error={errors.timezone}
            placeholder="UTC"
            hint="e.g. Asia/Kolkata, Europe/London, America/New_York"
          />

          <AppText variant="overline" color="textSubtle" style={styles.group}>Body</AppText>
          <TextField label="Height" leftIcon="human-male-height" value={form.height} onChangeText={set('height')} error={errors.height} placeholder="170" hint="cm" maxLength={6} {...num} onSubmitEditing={() => weightRef.current?.focus()} />
          <TextField ref={weightRef} label="Weight" leftIcon="scale-bathroom" value={form.weight} onChangeText={set('weight')} error={errors.weight} placeholder="68" hint={profile.bmi !== null ? `kg · BMI is ${profile.bmi.toFixed(1)} (calculated for you)` : 'kg · BMI is calculated for you'} maxLength={6} {...num} onSubmitEditing={() => waistRef.current?.focus()} />
          <TextField ref={waistRef} label="Waist (optional)" leftIcon="tape-measure" value={form.waist} onChangeText={set('waist')} error={errors.waist} placeholder="82" hint="cm" maxLength={6} {...num} onSubmitEditing={() => sleepRef.current?.focus()} />

          <AppText variant="overline" color="textSubtle" style={styles.group}>Lifestyle</AppText>
          <ChipSelect label="How often do you exercise?" options={EXERCISE} value={form.exercise} onChange={set('exercise')} />
          <TextField ref={sleepRef} label="Typical sleep" leftIcon="sleep" value={form.sleep} onChangeText={set('sleep')} error={errors.sleep} placeholder="7.5" hint="hours per night" maxLength={5} {...num} returnKeyType="done" />
          <TextField label="Daily water goal" leftIcon="cup-water" value={form.waterGoal} onChangeText={set('waterGoal')} error={errors.waterGoal} placeholder="2500" hint="ml per day (500 to 10000). Shown on the Track tab." maxLength={5} keyboardType="number-pad" />
          <ChipSelect label="Smoking" options={SMOKING} value={form.smoking} onChange={set('smoking')} />
          <ChipSelect label="Alcohol" options={ALCOHOL} value={form.alcohol} onChange={set('alcohol')} />

          <AppText variant="overline" color="textSubtle" style={styles.group}>From a recent blood test</AppText>
          <ChipSelect label="Cholesterol level" options={CHOLESTEROL} value={form.cholesterol} onChange={set('cholesterol')} hint="Use your doctor's report. If you don't know it, leave this blank." />

          <Button label="Save profile" icon="content-save-outline" onPress={() => void save()} loading={saving} />
        </View>
        <Disclaimer />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },
  form: { marginTop: 18 },
  group: { marginTop: 8, marginBottom: 10 },
});
