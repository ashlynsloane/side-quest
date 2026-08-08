import type { TrainingBlockPlan } from '@circuit/domain';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import LegacyGoalPlanScreen from '@/components/legacy-goal-plan-screen';
import { getLatestTrainingBlock } from '@/services/database';
import { useTheme } from '@/state/theme-context';
import { refreshLatestWholeAthletePlan } from '@/services/whole-athlete-plan-runtime';

const PLAN_WATCH_INTERVAL_MS = 1000;

export default function GoalPlanScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const hasRacePlan = useCanonicalWholeAthletePlan();
  return <View style={styles.root}>
    <LegacyGoalPlanScreen />
    {hasRacePlan ? <Pressable
      accessibilityRole="button"
      accessibilityLabel="Edit race priorities"
      onPress={() => router.push('/race-intent' as Href)}
      style={({ pressed }) => [
        styles.raceIntentButton,
        { backgroundColor: tokens.accent, shadowColor: tokens.text },
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.raceIntentEyebrow}>RACE INTENT V2</Text>
      <Text style={styles.raceIntentLabel}>Race priorities</Text>
    </Pressable> : null}
  </View>;
}

function useCanonicalWholeAthletePlan(): boolean {
  const lastSignature = useRef<string | null>(null);
  const [hasRacePlan, setHasRacePlan] = useState(false);

  useFocusEffect(useCallback(() => {
    let live = true;
    let checking = false;

    const check = async () => {
      if (!live || checking) return;
      checking = true;
      try {
        const saved = await getLatestTrainingBlock();
        const block = saved?.block ?? null;
        if (live) setHasRacePlan(Boolean(block && block.goal.type !== 'general_offseason' && block.goal.disciplines.length));
        const signature = blockSignature(block);
        if (lastSignature.current === signature) return;
        await refreshLatestWholeAthletePlan();
        if (live) lastSignature.current = signature;
      } catch {
        // Keep the old signature so the next interval retries the canonical rebuild.
        // The setup screen continues to own user-facing strength-plan errors.
      } finally {
        checking = false;
      }
    };

    void check();
    const interval = setInterval(() => { void check(); }, PLAN_WATCH_INTERVAL_MS);
    return () => {
      live = false;
      clearInterval(interval);
    };
  }, []));

  return hasRacePlan;
}

function blockSignature(block: TrainingBlockPlan | null): string {
  if (!block) return 'no-plan';
  return JSON.stringify({
    id: block.id,
    goal: block.goal,
    weeks: block.weeks.map((week) => ({
      id: week.id,
      phase: week.phase,
      sessions: week.sessions.map((session) => ({
        id: session.id,
        date: session.date,
        load: session.intendedLoad,
        status: session.completionStatus,
        workoutId: session.workout.id,
        duration: session.workout.estimatedElapsedSeconds,
      })),
    })),
  });
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  raceIntentButton: {
    position: 'absolute',
    right: 16,
    bottom: 18,
    minWidth: 142,
    borderRadius: 17,
    paddingHorizontal: 15,
    paddingVertical: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
    elevation: 5,
  },
  raceIntentEyebrow: { color: '#FFFFFF', opacity: 0.76, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.8 },
  raceIntentLabel: { color: '#FFFFFF', fontSize: 14, lineHeight: 19, fontWeight: '900' },
  pressed: { opacity: 0.82 },
});
