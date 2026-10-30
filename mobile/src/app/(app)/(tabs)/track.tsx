import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { trackingApi, TRACKING_OPTIONS, type GoalType, type MealType } from '@/api/tracking';
import type { ExerciseIntensity } from '@/api/types';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppText } from '@/components/ui/AppText';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { ErrorState, LoadingView } from '@/components/ui/StateViews';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '@/theme';
import { formatDateInput } from '@/utils/validation';
import { formatTimeInput } from '@/utils/medicineForm';
import { buildExercisePayload, buildHydrationPayload, buildNutritionPayload, buildSleepPayload, defaultGoalUnit, isIsoCalendarDate, localDateIso } from '@/utils/trackingForm';

const TABS = [
  { value: 'EXERCISE', label: 'Exercise', icon: 'run' },
  { value: 'SLEEP', label: 'Sleep', icon: 'sleep' },
  { value: 'HYDRATION', label: 'Water', icon: 'cup-water' },
  { value: 'NUTRITION', label: 'Meals', icon: 'food-apple' },
  { value: 'GOALS', label: 'Goals', icon: 'flag-checkered' },
] as const;
type Tab = typeof TABS[number]['value'];

async function loadTrackingData() {
  const [exercises, exerciseWeek, sleeps, sleepWeek, hydration, hydrationDaily, nutrition, nutritionDaily, goals] = await Promise.all([
    trackingApi.exercises(30), trackingApi.exerciseWeekly(7), trackingApi.sleeps(30), trackingApi.sleepWeekly(7),
    trackingApi.hydration(7), trackingApi.hydrationDaily(), trackingApi.nutrition(7), trackingApi.nutritionDaily(), trackingApi.goals(),
  ]);
  return { exercises, exerciseWeek, sleeps, sleepWeek, hydration, hydrationDaily, nutrition, nutritionDaily, goals };
}

export default function TrackScreen() {
  useStatusBarStyle('dark');
  const insets = useSafeAreaInsets();
  const topPad = insets.top + 22; // tab screens draw under the status bar/notch, so add the inset
  const [tab, setTab] = useState<Tab>('EXERCISE');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const { data, loading, error, reload } = useApiQuery(loadTrackingData);

  const [exerciseType, setExerciseType] = useState('Walking');
  const [exerciseDate, setExerciseDate] = useState(localDateIso());
  const [exerciseDuration, setExerciseDuration] = useState('');
  const [exerciseIntensity, setExerciseIntensity] = useState<ExerciseIntensity>('MODERATE');
  const [exerciseCalories, setExerciseCalories] = useState('');
  const [exerciseDistance, setExerciseDistance] = useState('');
  const [exerciseNotes, setExerciseNotes] = useState('');

  const [sleepDate, setSleepDate] = useState(localDateIso());
  const [bedtime, setBedtime] = useState('');
  const [wakeTime, setWakeTime] = useState('');
  const [sleepQuality, setSleepQuality] = useState('');
  const [sleepNotes, setSleepNotes] = useState('');

  const [waterDate, setWaterDate] = useState(localDateIso());
  const [waterAmount, setWaterAmount] = useState('250');
  const [waterNotes, setWaterNotes] = useState('');

  const [mealDate, setMealDate] = useState(localDateIso());
  const [mealType, setMealType] = useState<MealType>('BREAKFAST');
  const [foodItem, setFoodItem] = useState('');
  const [mealCalories, setMealCalories] = useState('');
  const [portionSize, setPortionSize] = useState('');
  const [mealNotes, setMealNotes] = useState('');

  const [goalType, setGoalType] = useState<GoalType>('EXERCISE');
  const [goalDescription, setGoalDescription] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalUnit, setGoalUnit] = useState(defaultGoalUnit('EXERCISE'));
  const [goalEndDate, setGoalEndDate] = useState('');

  async function perform(action: () => Promise<unknown>, success: string) {
    setSaving(true); setFormError(null); setFormSuccess(null);
    try {
      await action();
      setFormSuccess(success);
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'The entry could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function submitExercise() {
    const result = buildExercisePayload({ exercise_type: exerciseType, exercise_date: exerciseDate, duration_minutes: exerciseDuration, intensity: exerciseIntensity, calories_burned: exerciseCalories, distance_km: exerciseDistance, notes: exerciseNotes });
    if (result.payload === null) { setFormError(result.error); setFormSuccess(null); return; }
    await perform(async () => { await trackingApi.createExercise(result.payload); setExerciseDuration(''); setExerciseCalories(''); setExerciseDistance(''); setExerciseNotes(''); }, 'Exercise saved.');
  }
  async function submitSleep() {
    const result = buildSleepPayload({ sleep_date: sleepDate, bedtime, wake_time: wakeTime, sleep_quality: sleepQuality, notes: sleepNotes });
    if (result.payload === null) { setFormError(result.error); setFormSuccess(null); return; }
    await perform(async () => { await trackingApi.createSleep(result.payload); setSleepQuality(''); setSleepNotes(''); }, 'Sleep entry saved.');
  }
  async function submitWater() {
    const result = buildHydrationPayload({ hydration_date: waterDate, water_intake_ml: waterAmount, notes: waterNotes });
    if (result.payload === null) { setFormError(result.error); setFormSuccess(null); return; }
    await perform(async () => { await trackingApi.createHydration(result.payload); setWaterNotes(''); }, 'Water intake saved.');
  }
  async function submitMeal() {
    const result = buildNutritionPayload({ nutrition_date: mealDate, meal_type: mealType, food_item: foodItem, calories: mealCalories, portion_size: portionSize, notes: mealNotes });
    if (result.payload === null) { setFormError(result.error); setFormSuccess(null); return; }
    await perform(async () => { await trackingApi.createNutrition(result.payload); setFoodItem(''); setMealCalories(''); setPortionSize(''); setMealNotes(''); }, 'Meal saved.');
  }
  async function submitGoal() {
    const target = Number(goalTarget);
    if (!Number.isFinite(target) || target <= 0 || target > 100000 || !/^\d+(?:\.\d{1,2})?$/.test(goalTarget.trim())) { setFormError('Enter a target greater than 0 and no more than 100000, with at most 2 decimal places.'); setFormSuccess(null); return; }
    if (goalEndDate && !isIsoCalendarDate(goalEndDate)) { setFormError('Enter a real calendar date in YYYY-MM-DD format.'); setFormSuccess(null); return; }
    if (goalEndDate && goalEndDate < localDateIso()) { setFormError('The end date cannot be before the goal start date.'); setFormSuccess(null); return; }
    await perform(async () => {
      await trackingApi.createGoal({ goal_type: goalType, target_value: target, start_date: localDateIso(), ...(goalDescription.trim() ? { goal_description: goalDescription.trim() } : {}), ...(goalUnit.trim() ? { unit: goalUnit.trim() } : {}), ...(goalEndDate ? { end_date: goalEndDate } : {}) });
      setGoalDescription(''); setGoalTarget(''); setGoalEndDate('');
    }, 'Goal created. Progress is calculated from your recorded data.');
  }

  function confirmDelete(label: string, action: () => Promise<void>) {
    Alert.alert(`Delete ${label}?`, 'This entry will be removed from your records.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void perform(action, `${label} deleted.`); } },
    ]);
  }

  if (loading) return <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: topPad }]}><LoadingView label="Loading your wellness records…" /></ScrollView>;
  if (error && !data) return <View style={[styles.root, { paddingTop: insets.top }]}><ErrorState error={error} onRetry={() => void reload()} /></View>;
  if (!data) return null;

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: topPad }]} keyboardShouldPersistTaps="handled">
      <AppText variant="h1">Track your wellness</AppText>
      <AppText color="textMuted" style={styles.intro}>Record your activity, sleep, water and meals. Your history and goal progress come from your saved records.</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {TABS.map((item) => {
          const active = item.value === tab;
          return <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`${item.label} tab`} onPress={() => { setTab(item.value); setFormError(null); setFormSuccess(null); }} style={[styles.tab, active && styles.tabActive]}>
            <MaterialCommunityIcons name={item.icon as never} size={18} color={active ? colors.onPrimary : colors.primary} />
            <AppText variant="label" color={active ? 'onPrimary' : 'textMuted'}>{item.label}</AppText>
          </Pressable>;
        })}
      </ScrollView>

      {formError ? <Banner kind="error" message={formError} /> : null}
      {formSuccess ? <Banner kind="success" message={formSuccess} /> : null}
      {error && data ? <Banner kind="warning" message="Some data may be out of date. Pull down or use Refresh to retry." /> : null}

      {tab === 'EXERCISE' ? <>
        <SectionHeader title="Log exercise" />
        <Card style={styles.form}>
          <TextField label="Activity" value={exerciseType} onChangeText={setExerciseType} placeholder="e.g. Walking, cycling" maxLength={100} />
          <TextField label="Date (YYYY-MM-DD)" value={exerciseDate} onChangeText={(t) => setExerciseDate(formatDateInput(t))} keyboardType="number-pad" maxLength={10} placeholder="YYYY-MM-DD" />
          <TextField label="Duration (minutes, optional)" value={exerciseDuration} onChangeText={setExerciseDuration} keyboardType="numeric" />
          <SegmentedControl label="Intensity" value={exerciseIntensity} onChange={setExerciseIntensity} options={TRACKING_OPTIONS.intensities.map((x) => ({ ...x }))} />
          <TextField label="Calories burned (optional)" value={exerciseCalories} onChangeText={setExerciseCalories} keyboardType="numeric" />
          <TextField label="Distance in km (optional)" value={exerciseDistance} onChangeText={setExerciseDistance} keyboardType="decimal-pad" />
          <TextField label="Notes (optional)" value={exerciseNotes} onChangeText={setExerciseNotes} maxLength={2000} multiline />
          <Button label="Save exercise" icon="content-save-outline" loading={saving} onPress={() => void submitExercise()} />
        </Card>
        <SectionHeader title="Last 7 days" />
        <Card><Metric label="Total exercise" value={`${data.exerciseWeek.total_minutes} min`} /><Rule /><Metric label="Calories recorded" value={`${data.exerciseWeek.total_calories} kcal`} /></Card>
        <SectionHeader title="Recent exercise" />
        {data.exercises.length ? data.exercises.slice(0, 10).map((row) => <Card key={row.id} style={styles.entryCard}>
          <View style={styles.entryHead}><View style={styles.flex}><AppText variant="bodyStrong">{row.exercise_type}</AppText><AppText variant="caption" color="textSubtle">{row.exercise_date} · {row.intensity.toLowerCase()}</AppText></View><IconButton label={`Delete ${row.exercise_type}`} onPress={() => confirmDelete('exercise entry', () => trackingApi.deleteExercise(row.id))} /></View>
          <AppText color="textMuted">{row.duration_minutes != null ? `${row.duration_minutes} min` : 'Duration not recorded'}{row.calories_burned != null ? ` · ${row.calories_burned} kcal` : ''}{row.distance_km != null ? ` · ${row.distance_km} km` : ''}</AppText>
        </Card>) : <EmptyState icon="run" title="No exercise logged" message="Save an activity to start building your exercise history." />}
      </> : null}

      {tab === 'SLEEP' ? <>
        <SectionHeader title="Log sleep" />
        <Card style={styles.form}>
          <TextField label="Sleep date (YYYY-MM-DD)" value={sleepDate} onChangeText={(t) => setSleepDate(formatDateInput(t))} keyboardType="number-pad" maxLength={10} placeholder="YYYY-MM-DD" />
          <TextField label="Bedtime (24-hour HH:MM, optional)" value={bedtime} onChangeText={(t) => setBedtime(formatTimeInput(t))} keyboardType="number-pad" maxLength={5} placeholder="22:30" />
          <TextField label="Wake time (24-hour HH:MM, optional)" value={wakeTime} onChangeText={(t) => setWakeTime(formatTimeInput(t))} keyboardType="number-pad" maxLength={5} placeholder="06:30" />
          <TextField label="Sleep quality (1–10, optional)" value={sleepQuality} onChangeText={setSleepQuality} keyboardType="numeric" />
          <TextField label="Notes (optional)" value={sleepNotes} onChangeText={setSleepNotes} maxLength={2000} multiline />
          <AppText variant="caption" color="textSubtle">If both times are entered, duration is calculated by the backend. For overnight sleep, use the date you went to bed.</AppText>
          <Button label="Save sleep" icon="content-save-outline" loading={saving} onPress={() => void submitSleep()} />
        </Card>
        <SectionHeader title="Last 7 days" />
        <Card><Metric label="Average duration" value={data.sleepWeek.average_duration_hours != null ? `${data.sleepWeek.average_duration_hours.toFixed(1)} h` : 'No duration data'} /><Rule /><Metric label="Average quality" value={data.sleepWeek.average_quality != null ? `${data.sleepWeek.average_quality.toFixed(1)} / 10` : 'No quality data'} /></Card>
        <SectionHeader title="Recent sleep" />
        {data.sleeps.length ? data.sleeps.slice(0, 10).map((row) => <Card key={row.id} style={styles.entryCard}>
          <View style={styles.entryHead}><View style={styles.flex}><AppText variant="bodyStrong">{row.sleep_date}</AppText><AppText variant="caption" color="textSubtle">{row.bedtime && row.wake_time ? `${row.bedtime.slice(0, 5)} – ${row.wake_time.slice(0, 5)}` : 'Times not recorded'}</AppText></View><IconButton label="Delete sleep entry" onPress={() => confirmDelete('sleep entry', () => trackingApi.deleteSleep(row.id))} /></View>
          <AppText color="textMuted">{row.sleep_duration_hours != null ? `${row.sleep_duration_hours} hours` : 'Duration unavailable'}{row.sleep_quality != null ? ` · Quality ${row.sleep_quality}/10` : ''}</AppText>
        </Card>) : <EmptyState icon="sleep" title="No sleep logged" message="Record sleep times or sleep quality to build your history." />}
      </> : null}

      {tab === 'HYDRATION' ? <>
        <SectionHeader title="Log water intake" />
        <Card style={styles.form}>
          <TextField label="Amount (ml)" value={waterAmount} onChangeText={setWaterAmount} keyboardType="numeric" />
          <TextField label="Date (YYYY-MM-DD)" value={waterDate} onChangeText={(t) => setWaterDate(formatDateInput(t))} keyboardType="number-pad" maxLength={10} placeholder="YYYY-MM-DD" />
          <TextField label="Notes (optional)" value={waterNotes} onChangeText={setWaterNotes} maxLength={500} multiline />
          <Button label="Add water intake" icon="cup-water" loading={saving} onPress={() => void submitWater()} />
        </Card>
        <SectionHeader title="Today" />
        <Card>
          <Metric label="Water logged" value={`${data.hydrationDaily.total_ml} ml`} />
          <Rule />
          <Metric label="Daily target" value={data.hydrationDaily.goal_ml != null ? `${data.hydrationDaily.goal_ml} ml` : 'Not set in health profile'} />
          {data.hydrationDaily.percent_of_goal != null ? <><Rule /><ProgressBar value={data.hydrationDaily.percent_of_goal} label={`Hydration ${Math.round(data.hydrationDaily.percent_of_goal)} percent of target`} /><AppText variant="caption" color="textSubtle" style={styles.progressCaption}>{Math.round(data.hydrationDaily.percent_of_goal)}% of your saved daily target</AppText></> : null}
        </Card>
        <SectionHeader title="Recent water entries" />
        {data.hydration.length ? data.hydration.slice(0, 12).map((row) => <Card key={row.id} style={styles.entryCard}>
          <View style={styles.entryHead}><View style={styles.flex}><AppText variant="bodyStrong">{row.water_intake_ml} ml</AppText><AppText variant="caption" color="textSubtle">{row.hydration_date}{row.entry_time ? ` · ${row.entry_time.slice(0, 5)}` : ''}</AppText></View><IconButton label="Delete water entry" onPress={() => confirmDelete('water entry', () => trackingApi.deleteHydration(row.id))} /></View>
          {row.notes ? <AppText color="textMuted">{row.notes}</AppText> : null}
        </Card>) : <EmptyState icon="cup-water" title="No water logged" message="Record each drink to see today's total and your recent history." />}
      </> : null}

      {tab === 'NUTRITION' ? <>
        <SectionHeader title="Log a meal" />
        <Card style={styles.form}>
          <SegmentedControl label="Meal" value={mealType} onChange={setMealType} options={TRACKING_OPTIONS.meals.map((x) => ({ ...x }))} />
          <TextField label="Date (YYYY-MM-DD)" value={mealDate} onChangeText={(t) => setMealDate(formatDateInput(t))} keyboardType="number-pad" maxLength={10} placeholder="YYYY-MM-DD" />
          <TextField label="Food item (optional)" value={foodItem} onChangeText={setFoodItem} maxLength={255} placeholder="e.g. vegetable rice" />
          <TextField label="Calories (optional)" value={mealCalories} onChangeText={setMealCalories} keyboardType="numeric" />
          <TextField label="Portion size (optional)" value={portionSize} onChangeText={setPortionSize} maxLength={100} placeholder="e.g. 1 bowl" />
          <TextField label="Notes (optional)" value={mealNotes} onChangeText={setMealNotes} maxLength={1000} multiline />
          <Button label="Save meal" icon="content-save-outline" loading={saving} onPress={() => void submitMeal()} />
        </Card>
        <SectionHeader title="Today" />
        <Card><Metric label="Calories recorded" value={`${data.nutritionDaily.total_calories} kcal`} /><Rule /><Metric label="Meals logged" value={`${data.nutritionDaily.entries.length}`} /></Card>
        <SectionHeader title="Recent meals" />
        {data.nutrition.length ? data.nutrition.slice(0, 12).map((row) => <Card key={row.id} style={styles.entryCard}>
          <View style={styles.entryHead}><View style={styles.flex}><AppText variant="bodyStrong">{row.food_item || mealLabel(row.meal_type)}</AppText><AppText variant="caption" color="textSubtle">{row.nutrition_date} · {mealLabel(row.meal_type)}</AppText></View><IconButton label="Delete meal entry" onPress={() => confirmDelete('meal entry', () => trackingApi.deleteNutrition(row.id))} /></View>
          <AppText color="textMuted">{row.calories != null ? `${row.calories} kcal` : 'Calories not recorded'}{row.portion_size ? ` · ${row.portion_size}` : ''}</AppText>
        </Card>) : <EmptyState icon="food-apple" title="No meals logged" message="Add a meal to start a food history. Calories are optional and are not estimated automatically." />}
      </> : null}

      {tab === 'GOALS' ? <>
        <SectionHeader title="Create a wellness goal" />
        <Card style={styles.form}>
          <SegmentedControl label="Goal type" value={goalType} onChange={(value) => { setGoalType(value); setGoalUnit(defaultGoalUnit(value)); }} options={TRACKING_OPTIONS.goalTypes.map((x) => ({ ...x }))} />
          <TextField label="Description (optional)" value={goalDescription} onChangeText={setGoalDescription} maxLength={255} placeholder="e.g. Move more during the week" />
          <TextField label="Target value" value={goalTarget} onChangeText={setGoalTarget} keyboardType="decimal-pad" placeholder="Enter a positive target" />
          <TextField label="Unit (optional)" value={goalUnit} onChangeText={setGoalUnit} maxLength={50} placeholder="e.g. minutes/week" />
          <TextField label="End date (optional, YYYY-MM-DD)" value={goalEndDate} onChangeText={(t) => setGoalEndDate(formatDateInput(t))} keyboardType="number-pad" maxLength={10} placeholder="YYYY-MM-DD" />
          {goalType === 'OTHER' ? <AppText variant="caption" color="textSubtle">Other goals have no automatic progress source. You can manage their status, but current progress will remain unavailable.</AppText> : null}
          <Button label="Create goal" icon="flag-checkered" loading={saving} onPress={() => void submitGoal()} />
        </Card>
        <SectionHeader title="Your goals" />
        {data.goals.length ? data.goals.map((goal) => <Card key={goal.id} style={styles.entryCard}>
          <View style={styles.entryHead}><View style={styles.flex}><AppText variant="bodyStrong">{goal.goal_description?.trim() || goalTitle(goal.goal_type)}</AppText><AppText variant="caption" color="textSubtle">{goalTitle(goal.goal_type)} · {goal.status.toLowerCase()}</AppText></View><IconButton label={`Delete goal ${goal.goal_description || goal.id}`} onPress={() => confirmDelete('goal', () => trackingApi.deleteGoal(goal.id))} /></View>
          <AppText color="textMuted">Target: {goal.target_value ?? '—'}{goal.unit ? ` ${goal.unit}` : ''}</AppText>
          {goal.percentage_complete != null ? <><ProgressBar value={goal.percentage_complete} label={`${goalTitle(goal.goal_type)} progress ${Math.round(goal.percentage_complete)} percent`} /><AppText variant="caption" color="textSubtle">{Math.round(goal.percentage_complete)}% complete{goal.current_value != null ? ` · Current ${goal.current_value}` : ''}</AppText>{goal.progress_note ? <AppText variant="caption" color="textSubtle">{goal.progress_note}</AppText> : null}</> : <AppText variant="caption" color="textSubtle">{goal.progress_note || 'Progress is not available yet.'}</AppText>}
          {goal.start_date ? <AppText variant="caption" color="textSubtle">Started {goal.start_date}{goal.end_date ? ` · Ends ${goal.end_date}` : ''}</AppText> : null}
          {goal.status !== 'COMPLETED' && goal.status !== 'ABANDONED' ? <View style={styles.goalActions}>
            {goal.status === 'ACTIVE' ? <Button label="Pause" variant="secondary" onPress={() => void perform(() => trackingApi.updateGoal(goal.id, { status: 'PAUSED' }), 'Goal paused.')} style={styles.actionButton} /> : <Button label="Resume" variant="secondary" onPress={() => void perform(() => trackingApi.updateGoal(goal.id, { status: 'ACTIVE' }), 'Goal resumed.')} style={styles.actionButton} />}
            <Button label="Complete" onPress={() => void perform(() => trackingApi.updateGoal(goal.id, { status: 'COMPLETED' }), 'Goal marked complete.')} style={styles.actionButton} />
          </View> : null}
        </Card>) : <EmptyState icon="flag-checkered" title="No goals yet" message="Create a goal to track progress from your recorded wellness data." />}
      </> : null}

      <View style={styles.footerActions}><Button label="Refresh records" icon="refresh" variant="secondary" onPress={() => void reload()} loading={saving} /></View>
      <AppText variant="caption" color="textSubtle" style={styles.disclaimer}>HealthPredict is for educational wellness tracking, not diagnosis or treatment advice. Logs reflect only information you enter.</AppText>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><AppText color="textMuted">{label}</AppText><AppText variant="bodyStrong">{value}</AppText></View>;
}
function Rule() { return <View style={styles.rule} />; }
function IconButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={styles.iconButton}><MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.danger} /></Pressable>;
}
function mealLabel(meal: string): string { return meal.toLowerCase().replace(/(^|_)\w/g, (s) => s.replace('_', ' ').toUpperCase()); }
function goalTitle(type: string): string {
  const labels: Record<string, string> = { EXERCISE: 'Exercise', SLEEP: 'Sleep', HYDRATION: 'Hydration', WEIGHT: 'Weight', MEDICINE_ADHERENCE: 'Medicine adherence', OTHER: 'Other' };
  return labels[type] ?? type;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 40 },
  intro: { marginTop: 6, marginBottom: 18, lineHeight: 21 },
  tabs: { gap: 8, paddingBottom: 20 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, minHeight: 42, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  form: { gap: 2, marginBottom: 8 },
  entryCard: { marginBottom: 10, gap: 8 },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  metric: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 5 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 8 },
  iconButton: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  progressCaption: { marginTop: 8 },
  goalActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionButton: { flex: 1 },
  footerActions: { marginTop: 16 },
  disclaimer: { marginTop: 18, lineHeight: 18, textAlign: 'center' },
});
