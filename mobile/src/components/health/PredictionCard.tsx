import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { MLPrediction } from '@/api/types';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { colors } from '@/theme';

export interface PredictionCardProps {
  prediction: MLPrediction | null;
  missingFields: string[];
}

/**
 * The AI heart-risk estimate and its explanation. Exactly one of three states, mirroring the backend contract:
 *   prediction present  -> result + plain-language reasons
 *   missing fields      -> exactly what to add, with a link to do it (never a guess)
 *   neither             -> model unavailable right now
 */
export function PredictionCard({ prediction, missingFields }: PredictionCardProps) {
  const router = useRouter();

  if (!prediction) {
    return (
      <Card>
        <View style={styles.titleRow}>
          <MaterialCommunityIcons name="brain" size={22} color={colors.primary} />
          <AppText variant="h3">AI heart-risk estimate</AppText>
        </View>
        {missingFields.length > 0 ? (
          <>
            <AppText color="textMuted" style={styles.gap}>
              We can&apos;t estimate this yet. To keep the estimate honest we only use real information, never guesses. Please add:
            </AppText>
            {missingFields.map((f) => (
              <View key={f} style={styles.bulletRow}>
                <MaterialCommunityIcons name="circle-small" size={22} color={colors.textSubtle} />
                <AppText style={styles.flex}>{f}</AppText>
              </View>
            ))}
            <AppText variant="caption" color="textSubtle" style={styles.gapSmall}>
              The estimate is calculated when an assessment is saved, so after updating your profile, record a new assessment.
            </AppText>
            <Button label="Complete health profile" icon="account-edit-outline" variant="secondary" style={styles.gap} onPress={() => router.push('/health-profile')} />
          </>
        ) : (
          <AppText color="textMuted" style={styles.gap}>
            The AI estimate isn&apos;t available right now. Your health score above is not affected.
          </AppText>
        )}
      </Card>
    );
  }

  const increases = prediction.top_factors.filter((f) => f.direction === 'increases');
  const decreases = prediction.top_factors.filter((f) => f.direction !== 'increases');

  return (
    <Card>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="brain" size={22} color={colors.primary} />
        <AppText variant="h3">AI heart-risk estimate</AppText>
      </View>
      <View style={[styles.summary, styles.gap]}>
        <RiskBadge category={prediction.risk_level} prefix="AI estimate:" />
        <AppText variant="caption" color="textSubtle">
          Model confidence {Math.round(prediction.confidence_percent)}%
        </AppText>
      </View>
      <AppText variant="display" accessibilityLabel={`Estimated likelihood ${Math.round(prediction.probability * 100)} percent`}>
        {Math.round(prediction.probability * 100)}%
      </AppText>
      <AppText variant="caption" color="textSubtle">
        estimated likelihood of cardiovascular disease, from a model trained on population data
      </AppText>

      <AppText color="textMuted" style={styles.gap}>
        {prediction.explanation_text}
      </AppText>

      <FactorGroup title="What raised the estimate" factors={increases} color={colors.danger} icon="arrow-up-bold-circle-outline" />
      <FactorGroup title="What lowered the estimate" factors={decreases} color={colors.success} icon="arrow-down-bold-circle-outline" />

      <AppText variant="caption" color="textSubtle" style={styles.gap}>
        Bars show each factor&apos;s influence relative to the strongest one, not a percentage of your risk. Model {prediction.model_version}.
      </AppText>
      <AppText variant="caption" color="textSubtle" style={styles.gapSmall}>
        {prediction.disclaimer}
      </AppText>
    </Card>
  );
}

function FactorGroup({ title, factors, color, icon }: { title: string; factors: MLPrediction['top_factors']; color: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }) {
  if (factors.length === 0) return null;
  return (
    <View style={styles.group}>
      <View style={styles.groupTitle}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
        <AppText variant="label" style={{ color }}>
          {title}
        </AppText>
      </View>
      {factors.map((f) => (
        <View key={f.key} style={styles.factor}>
          <AppText variant="bodyStrong">{f.label}</AppText>
          <ProgressBar value={f.relative_strength} color={color} height={6} label={`${f.label}: relative influence ${Math.round(f.relative_strength)} out of 100`} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gap: { marginTop: 14 },
  gapSmall: { marginTop: 8 },
  flex: { flex: 1 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  group: { marginTop: 18, gap: 10 },
  groupTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factor: { gap: 6 },
});
