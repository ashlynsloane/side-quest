import type { TodayRecommendation, WorkoutVariantLevel } from '@circuit/domain';
import type { DailyReadinessCheckIn } from '@/services/readiness';
import { recommendToday, workoutForRecommendation } from '@circuit/planner';
import { createReentryWorkout } from '@circuit/generator';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getActiveTrainingCheckIn,
  getLatestPTProfile,
  getLatestTrainingBlock,
  getTrainingCalendarEvents,
  getTrainingContinuitySummary,
  getTodayReadinessCheckIn,
} from '@/services/database';
import { readinessDetail, readinessHeadline, readinessScore, readinessVariant } from '@/services/readiness';
import { useWorkoutContext } from '@/state/workout-context';
import { checkWorkoutAgainstRecordedInjuries, type MobileInjuryPreflight } from '@/services/rehab-workout-preflight';

const VARIANTS: Array<{ id: WorkoutVariantLevel; title: string; detail: string }> = [
  { id: 'full', title: 'Full', detail: 'Complete the planned stimulus.' },
  { id: 'reduced', title: 'Reduced', detail: 'Preserve the main work with less total volume.' },
  { id: 'minimum', title: 'Minimum', detail: 'A short continuity dose for a constrained day.' },
];

export default function TodayScreen() {
  const router = useRouter();
  const { beginWorkout, setPreviewWorkout } = useWorkoutContext();
  const [recommendation, setRecommendation] = useState<TodayRecommendation | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<WorkoutVariantLevel>('full');
  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState<DailyReadinessCheckIn | null>(null);
  const [reentryMode, setReentryMode] = useState<'none' | 'interrupted' | 'returning'>('none');
  const [rehabCheck, setRehabCheck] = useState<MobileInjuryPreflight | null>(null);
  const [rehabLoading, setRehabLoading] = useState(
    process.env.EXPO_PUBLIC_ENABLE_REHAB_BETA === 'true',
  );
  const [rehabError, setRehabError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    const now = new Date();
    const from = startOfDay(now).toISOString();
    const toDate = new Date(now);
    toDate.setDate(toDate.getDate() + 7);
    void Promise.all([
      getLatestTrainingBlock(),
      getActiveTrainingCheckIn(),
      getTrainingCalendarEvents({ from, to: toDate.toISOString() }),
      getTodayReadinessCheckIn(),
      getTrainingContinuitySummary(),
      getLatestPTProfile(),
    ]).then(([savedBlock, checkIn, events, todayReadiness, continuity, ptProfile]) => {
      if (cancelled) return;
      const next = recommendToday({
        block: savedBlock?.block ?? null,
        checkIn,
        calendarEvents: events,
      });
      setRecommendation(next);
      setReadiness(todayReadiness);
      const returning = Boolean(ptProfile?.active && ptProfile.conditions.some((condition) => condition.status === 'returning' || condition.status === 'active'));
      const interrupted = (continuity.daysSinceLastStrength ?? 0) >= 14;
      const mode = returning ? 'returning' : interrupted ? 'interrupted' : 'none';
      setReentryMode(mode);
      const planVariant = next.recommendedVariant ?? 'full';
      const readinessDose = todayReadiness ? readinessVariant(todayReadiness) : 'full';
      const continuityDose: WorkoutVariantLevel = mode === 'none' ? 'full' : mode === 'returning' ? 'minimum' : 'reduced';
      setSelectedVariant(moreConservative(moreConservative(planVariant, readinessDose), continuityDose));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []));

  function workoutFor(level: WorkoutVariantLevel) {
    if (!recommendation) return null;
    const workout = workoutForRecommendation(recommendation, level);
    if (!workout || reentryMode === 'none') return workout;
    return createReentryWorkout(workout, {
      conservative: reentryMode === 'returning',
      level,
    });
  }

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_ENABLE_REHAB_BETA !== 'true') return;
    let active=true;
    setRehabLoading(true);
    const currentWorkout=workoutFor(selectedVariant);
    void checkWorkoutAgainstRecordedInjuries(currentWorkout).then(result=>{
      if(!active)return;
      setRehabCheck(result);
      setRehabError(null);
    }).catch(error=>{
      if(!active)return;
      setRehabCheck(null);
      setRehabError(error instanceof Error?error.message:String(error));
    }).finally(()=>{if(active)setRehabLoading(false);});
    return ()=>{active=false;};
  }, [recommendation, reentryMode, selectedVariant]);

  function preview() {
    const workout = workoutFor(selectedVariant);
    if (!workout) return;
    setPreviewWorkout(workout);
    router.push('/workout-preview' as Href);
  }

  function start() {
    if(process.env.EXPO_PUBLIC_ENABLE_REHAB_BETA === 'true' &&
       (rehabLoading || rehabError ||
       (rehabCheck?.activeInjuryCases??0)>0 &&
       rehabCheck?.preflight?.disposition!=='no_coded_conflict')) {
      Alert.alert('Injury review needed',
        'Your current injury records have not been clinically reconciled with this workout. This beta cannot clear an exercise or override an existing restriction.',
        [
          {text:'Cancel',style:'cancel'},
          {text:'Open injury history',onPress:()=>router.push('/rehab' as Href)},
        ],
      );
      return;
    }
    const workout = workoutFor(selectedVariant);
    if (!workout) return;
    beginWorkout(workout);
    router.push('/active-workout' as Href);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Home</Text>
        </Pressable>
        <Text style={styles.topTitle}>Today</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>DAILY COACH</Text>
          <Text style={styles.title}>What should I do today?</Text>
          <Text style={styles.subtitle}>
            Uses your active plan, daily readiness, temporary restrictions, and synced endurance calendar.
          </Text>
        </View>

        {loading ? <Text style={styles.helper}>Reviewing today’s plan…</Text> : null}

        {process.env.EXPO_PUBLIC_ENABLE_REHAB_BETA === 'true' ? (
          <Pressable accessibilityRole="button"
            onPress={() => router.push('/rehab' as Href)} style={styles.checkInButton}>
            <Text style={styles.checkInTitle}>Longitudinal rehabilitation (beta)</Text>
            <Text style={styles.helper}>
              {rehabLoading ? 'Checking local injury records and workout exposure…'
                : rehabError ? 'Injury preflight is unavailable. Workout start is held for review.'
                : (rehabCheck?.activeInjuryCases??0)===0 ? 'No active longitudinal injury cases recorded.'
                : rehabCheck?.preflight?.disposition==='blocked'
                  ? 'A recorded safety concern or restriction blocks this workout.'
                  : rehabCheck?.preflight?.disposition==='review_needed'
                    ? 'This workout needs clinical and exercise-metadata review before start.'
                    : 'No coded conflict detected. This is not medical clearance.'}
            </Text>
            <Text style={styles.helper}>New injury records do not automatically change your strength plan.</Text>
          </Pressable>
        ) : null}

        {recommendation ? (
          <>
            <View style={styles.recommendationCard}>
              <Text style={styles.statusLabel}>{formatStatus(recommendation.status)}</Text>
              <Text style={styles.recommendationTitle}>{recommendation.headline}</Text>
              {recommendation.explanation.map((item) => (
                <View key={item} style={styles.reasonRow}>
                  <Text style={styles.reasonBullet}>•</Text>
                  <Text style={styles.reasonText}>{item}</Text>
                </View>
              ))}
            </View>

            {reentryMode !== 'none' ? (
              <View style={styles.reentryCard}>
                <Text style={styles.cardEyebrow}>{reentryMode === 'returning' ? 'RETURN-FROM-INJURY MODE' : 'RE-ENTRY MODE'}</Text>
                <Text style={styles.readinessTitle}>{reentryMode === 'returning' ? 'Use a conservative return dose' : 'Rebuild after interrupted strength training'}</Text>
                <Text style={styles.helper}>The selected workout reduces repetitions or time below the prior prescription before normal progression resumes.</Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/readiness' as Href)}
              style={[styles.readinessCard, !readiness && styles.readinessCardEmpty]}
            >
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardEyebrow}>DAILY READINESS</Text>
                <Text style={styles.cardArrow}>→</Text>
              </View>
              <Text style={styles.readinessTitle}>
                {readiness ? readinessHeadline(readiness) : 'Add a 30-second readiness check-in'}
              </Text>
              <Text style={styles.helper}>
                {readiness
                  ? `${readinessScore(readiness).toFixed(1)} / 5 · ${readinessDetail(readiness)}`
                  : 'Sleep, energy, muscle freshness, stress, and motivation help choose the right session dose.'}
              </Text>
            </Pressable>

            {recommendation.session ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Choose today’s dose</Text>
                <Text style={styles.helper}>The recommended option is selected, but you remain in control.</Text>
                <View style={styles.variantList}>
                  {VARIANTS.map((variant) => {
                    const workout = workoutFor(variant.id);
                    const selected = selectedVariant === variant.id;
                    return (
                      <Pressable
                        key={variant.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setSelectedVariant(variant.id)}
                        style={[styles.variantCard, selected && styles.variantCardSelected]}
                      >
                        <View style={styles.variantTopRow}>
                          <Text style={[styles.variantTitle, selected && styles.selectedText]}>{variant.title}</Text>
                          <Text style={styles.variantMinutes}>{workout ? Math.round(workout.totalWorkSeconds / 60) : 0} min</Text>
                        </View>
                        <Text style={styles.variantDetail}>{variant.detail}</Text>
                        {recommendation.recommendedVariant === variant.id ? (
                          <Text style={styles.recommendedLabel}>RECOMMENDED TODAY</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.buttonRow}>
                  <Pressable accessibilityRole="button" onPress={preview} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Preview</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={start} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>Start {selectedVariant}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.buttonStack}>
                <Pressable accessibilityRole="button" onPress={() => router.push('/goal-plan' as Href)} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Open Goal Plan</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => router.push('/generate' as Href)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Generate One-Off Workout</Text>
                </Pressable>
              </View>
            )}

            {recommendation.session ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/session-adjustment' as Href)} style={styles.adjustButton}>
                <Text style={styles.adjustTitle}>Need to change today’s plan?</Text>
                <Text style={styles.helper}>Shorten, make easier, move, replace, or skip it without compressing the rest of the week.</Text>
              </Pressable>
            ) : null}

            <Pressable accessibilityRole="button" onPress={() => router.push('/today-check-in' as Href)} style={styles.checkInButton}>
              <Text style={styles.checkInTitle}>Body feels different?</Text>
              <Text style={styles.helper}>Update soreness, tightness, pain, or temporary limitations.</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function moreConservative(
  left: WorkoutVariantLevel,
  right: WorkoutVariantLevel,
): WorkoutVariantLevel {
  const order: Record<WorkoutVariantLevel, number> = { full: 0, reduced: 1, minimum: 2 };
  return order[left] >= order[right] ? left : right;
}

function formatStatus(status: TodayRecommendation['status']) {
  switch (status) {
    case 'planned_session': return 'PLANNED STRENGTH DAY';
    case 'recover': return 'RECOVERY / RESTRICTION';
    case 'no_strength_today': return 'NO STRENGTH SCHEDULED';
    case 'no_plan': return 'NO ACTIVE PLAN';
  }
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

const colors = {
  background: '#E4EBE3', card: '#FFFDF8', ink: '#01234D', muted: '#6B7770',
  border: '#164C73', accent: '#153E2F', accentSoft: '#D8E9DF', warm: '#F4E7D2',
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  backButton: { flex: 1, paddingVertical: 6 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  topTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 56, gap: 16 },
  intro: { gap: 6 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700', lineHeight: 36 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  recommendationCard: { backgroundColor: colors.accent, borderRadius: 22, padding: 20, gap: 7 },
  statusLabel: { color: '#C7D9CE', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  recommendationTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', lineHeight: 30, marginBottom: 4 },
  reasonRow: { flexDirection: 'row', gap: 8 },
  reasonBullet: { color: '#D8E9DF', fontSize: 16 },
  reasonText: { flex: 1, color: '#D8E9DF', fontSize: 14, lineHeight: 20 },
  reentryCard: { backgroundColor: colors.warm, borderRadius: 20, padding: 17, gap: 6 },
  readinessCard: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent, borderRadius: 20, padding: 17, gap: 6 },
  readinessCardEmpty: { backgroundColor: colors.card, borderColor: colors.border },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardEyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  cardArrow: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  readinessTitle: { color: colors.ink, fontSize: 17, fontWeight: '700', lineHeight: 22 },
  section: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 17, gap: 11 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  variantList: { gap: 9 },
  variantCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, gap: 4 },
  variantCardSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  variantTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  variantTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  variantMinutes: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  variantDetail: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  recommendedLabel: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginTop: 3 },
  selectedText: { color: colors.accent },
  buttonRow: { flexDirection: 'row', gap: 10 },
  buttonStack: { gap: 10 },
  primaryButton: { flex: 1, backgroundColor: colors.accent, borderRadius: 15, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', textTransform: 'capitalize' },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: colors.accent, borderRadius: 15, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', backgroundColor: colors.card },
  secondaryButtonText: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  adjustButton: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.accent, borderRadius: 20, padding: 17, gap: 5 },
  adjustTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  checkInButton: { backgroundColor: colors.warm, borderRadius: 18, padding: 16, gap: 4 },
  checkInTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
});
