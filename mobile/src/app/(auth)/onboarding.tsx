import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HealthArt, MedicineArt, WellnessArt } from '@/components/illustrations/OnboardingArt';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { useStatusBarStyle } from '@/hooks/useStatusBarStyle';
import { markOnboardingSeen } from '@/storage/flags';
import { colors } from '@/theme';

const SLIDES = [
  {
    key: 'health',
    Art: HealthArt,
    title: 'Understand your health',
    body: 'Complete a short assessment to get a transparent health score and an AI-based risk estimate, with plain-language reasons.',
  },
  {
    key: 'medicine',
    Art: MedicineArt,
    title: 'Stay on top of your medicines',
    body: 'Keep your medicines, daily schedule and adherence in one place, with gentle reminders when a dose is due.',
  },
  {
    key: 'wellness',
    Art: WellnessArt,
    title: 'Build healthier habits',
    body: 'Log exercise, sleep, water and meals, set goals, and watch your weekly progress in simple reports.',
  },
] as const;

export default function Onboarding() {
  useStatusBarStyle('dark');
  const router = useRouter();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  async function finish(to: '/register' | '/login') {
    await markOnboardingSeen();
    router.replace(to);
  }

  function next() {
    const nextIndex = Math.min(index + 1, SLIDES.length - 1);
    listRef.current?.scrollToOffset({ offset: nextIndex * width, animated: true });
    setIndex(nextIndex);
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topBar}>
        {!isLast ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Skip introduction" hitSlop={12} onPress={() => void finish('/login')}>
            <AppText variant="bodyStrong" color="textSubtle">
              Skip
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <item.Art />
            <AppText variant="display" center style={styles.title}>
              {item.title}
            </AppText>
            <AppText color="textMuted" center style={styles.body}>
              {item.body}
            </AppText>
          </View>
        )}
      />

      <View style={styles.bottom}>
        <View style={styles.dots} accessibilityLabel={`Page ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        {isLast ? (
          <>
            <Button label="Create your account" onPress={() => void finish('/register')} />
            <Button label="I already have an account" variant="ghost" onPress={() => void finish('/login')} />
            <Disclaimer />
          </>
        ) : (
          <Button label="Next" onPress={next} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  topBar: { height: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 24 },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  title: { marginTop: 12, fontSize: 28, lineHeight: 34 },
  body: { maxWidth: 340 },
  bottom: { paddingHorizontal: 24, paddingBottom: 12, gap: 8, minHeight: 190, justifyContent: 'flex-end' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderStrong },
  dotActive: { width: 24, backgroundColor: colors.primary },
});
