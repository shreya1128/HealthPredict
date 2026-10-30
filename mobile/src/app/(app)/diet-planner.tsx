import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { nutritionPlanApi, type MealPlanResponse } from '@/api/nutritionPlan';
import { toApiError } from '@/api/errors';
import { AppText } from '@/components/ui/AppText';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { TextField } from '@/components/ui/TextField';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { colors, radius } from '@/theme';

const DIET_OPTIONS = [
  { value: 'VEGETARIAN', label: 'Vegetarian' },
  { value: 'NON_VEGETARIAN', label: 'Non-Vegetarian' },
  { value: 'VEGAN', label: 'Vegan' },
];

const ALLERGY_OPTIONS = [
  { value: 'PEANUTS', label: 'Peanuts' },
  { value: 'DAIRY', label: 'Dairy' },
  { value: 'EGGS', label: 'Eggs' },
  { value: 'GLUTEN', label: 'Gluten' },
  { value: 'NUTS', label: 'Tree Nuts' },
  { value: 'SOY', label: 'Soy' },
  { value: 'FISH', label: 'Fish' },
  { value: 'SESAME', label: 'Sesame' },
];

export default function DietPlannerScreen() {
  useStatusBarStyle('dark');
  const [dietType, setDietType] = useState('VEGETARIAN');
  const [calories, setCalories] = useState('1800');
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<MealPlanResponse | null>(null);

  const toggleAllergy = (val: string) => {
    setSelectedAllergies((prev) =>
      prev.includes(val) ? prev.filter((a) => a !== val) : [...prev, val]
    );
  };

  const handleGenerate = async () => {
    setError(null);
    const calNum = parseInt(calories, 10);
    if (isNaN(calNum) || calNum < 1200 || calNum > 3500) {
      setError('Please enter a daily calorie target between 1,200 and 3,500 kcal.');
      return;
    }
    setLoading(true);
    try {
      const res = await nutritionPlanApi.generateMealPlan({
        diet_type: dietType,
        allergies: selectedAllergies,
        calorie_target: calNum,
        target_days: 7,
      });
      setPlan(res);
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <AppText variant="h1">Balanced Diet Planner</AppText>
        <AppText color="textMuted" style={styles.intro}>
          Generate a 7-day nutritional meal plan based on ICMR-NIN & USDA balanced dietary guidelines.
        </AppText>

        <Card style={styles.formCard}>
          <SectionHeader title="Your Dietary Preferences" />

          <ChipSelect
            label="Dietary Pattern"
            options={DIET_OPTIONS}
            value={dietType}
            onChange={(v) => v && setDietType(v)}
          />

          <TextField
            label="Daily Calorie Target (kcal)"
            value={calories}
            onChangeText={setCalories}
            keyboardType="number-pad"
            placeholder="1800"
            hint="Recommended range: 1,400 – 2,500 kcal for general maintenance"
          />

          <View style={styles.allergySection}>
            <AppText variant="caption" color="textMuted" style={styles.allergyTitle}>
              Allergies & Intolerances to Exclude:
            </AppText>
            <View style={styles.chipGrid}>
              {ALLERGY_OPTIONS.map((opt) => {
                const active = selectedAllergies.includes(opt.value);
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => toggleAllergy(opt.value)}
                    style={[styles.chip, active && styles.chipActive]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                  >
                    <MaterialCommunityIcons
                      name={active ? 'check-circle' : 'plus-circle-outline'}
                      size={16}
                      color={active ? '#FFFFFF' : colors.textSubtle}
                    />
                    <AppText
                      variant="caption"
                      color={active ? 'onPrimary' : 'text'}
                      style={styles.chipText}
                    >
                      {opt.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {error ? <Banner kind="error" message={error} /> : null}

          <Button
            label="Generate 7-Day Meal Plan"
            icon="silverware-fork-knife"
            loading={loading}
            onPress={() => void handleGenerate()}
            style={styles.generateBtn}
          />
        </Card>

        {plan ? (
          <View style={styles.planContainer}>
            <SectionHeader title="7-Day Nutritional Schedule" />

            {plan.allergies_excluded?.length > 0 ? (
              <Banner
                kind="success"
                message={`Strictly excluded: ${plan.allergies_excluded.join(', ')}`}
              />
            ) : null}

            {plan.days.map((day) => (
              <Card key={day.day} style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <AppText variant="h2">{day.day}</AppText>
                  <AppText variant="caption" color="primary" style={styles.dayCalories}>
                    {day.totals.calories} kcal · {day.totals.protein_g}g Protein
                  </AppText>
                </View>

                {day.breakfast ? (
                  <MealRow meal={day.breakfast} label="Breakfast" icon="coffee-outline" />
                ) : null}
                {day.lunch ? (
                  <MealRow meal={day.lunch} label="Lunch" icon="food-drumstick-outline" />
                ) : null}
                {day.snack ? (
                  <MealRow meal={day.snack} label="Evening Snack" icon="cookie-outline" />
                ) : null}
                {day.dinner ? (
                  <MealRow meal={day.dinner} label="Dinner" icon="food-turkey" />
                ) : null}
              </Card>
            ))}

            <SectionHeader title="Weekly Grocery Items" />
            <Card style={styles.groceryCard}>
              <View style={styles.groceryGrid}>
                {plan.grocery_list.map((ing) => (
                  <View key={ing} style={styles.groceryItem}>
                    <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={16} color={colors.primary} />
                    <AppText variant="caption" style={styles.groceryText}>{ing}</AppText>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        ) : null}

        <Disclaimer />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function MealRow({ meal, label, icon }: { meal: any; label: string; icon: string }) {
  return (
    <View style={styles.mealRow}>
      <View style={styles.mealIconBox}>
        <MaterialCommunityIcons name={icon as any} size={20} color={colors.primary} />
      </View>
      <View style={styles.mealInfo}>
        <AppText variant="caption" color="textSubtle" style={styles.mealLabel}>{label}</AppText>
        <AppText variant="bodyStrong">{meal.name}</AppText>
        <AppText variant="caption" color="textMuted">
          {meal.portion} · {meal.calories} kcal ({meal.protein_g}g P / {meal.carbs_g}g C / {meal.fat_g}g F)
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  intro: { marginBottom: 16 },
  formCard: { gap: 14, marginBottom: 20 },
  allergySection: { marginTop: 4, gap: 8 },
  allergyTitle: { fontWeight: '600' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { fontWeight: '500' },
  generateBtn: { marginTop: 6 },
  planContainer: { gap: 16, marginTop: 8 },
  dayCard: { gap: 12 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, paddingBottom: 8 },
  dayCalories: { fontWeight: '600' },
  mealRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  mealIconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSubtle, alignItems: 'center', justifyContent: 'center' },
  mealInfo: { flex: 1, gap: 2 },
  mealLabel: { textTransform: 'uppercase', fontSize: 10, fontWeight: '700' },
  groceryCard: { padding: 16 },
  groceryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  groceryItem: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '47%' },
  groceryText: { flex: 1 },
});
