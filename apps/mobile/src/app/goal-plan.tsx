import type { TrainingBlockPlan } from '@circuit/domain';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import LegacyGoalPlanScreen from '@/components/legacy-goal-plan-screen';
import { V23Icon } from '@/components/v23-ui';
import { getLatestTrainingBlock } from '@/services/database';
import { useTheme } from '@/state/theme-context';
import { refreshLatestWholeAthletePlan } from '@/services/whole-athlete-plan-runtime';
import type { DesignTokens } from '@/theme';

const PLAN_WATCH_INTERVAL_MS = 1000;

export default function GoalPlanScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const hasRacePlan = useCanonicalWholeAthletePlan();
  return <View style={styles.root}>
    <LegacyGoalPlanScreen />
    {hasRacePlan ? <View style={styles.dockWrap} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit race priorities"
        onPress={() => router.push('/race-intent' as Href)}
        style={({ pressed }) => [styles.raceIntentDock, pressed && styles.pressed]}
      >
        <View style={styles.dockIcon}><V23Icon name="goal" color={tokens.accent} size={19} /></View>
        <View style={styles.dockCopy}>
          <Text style={styles.dockEyebrow}>RACE STRATEGY</Text>
          <Text style={styles.dockTitle}>Set race priorities</Text>
          <Text style={styles.dockBody}>Choose the outcome, top discipline, and tradeoffs.</Text>
        </View>
        <V23Icon name="chevron" color={tokens.textMuted} size={17} />
      </Pressable>
    </View> : null}
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

function makeStyles(tokens: DesignTokens) {
  return StyleSheet.create({
    root: { flex: 1 },
    dockWrap: { position: 'absolute', left: 12, right: 12, bottom: 12 },
    raceIntentDock: {
      minHeight: 72,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: tokens.border,
      backgroundColor: tokens.surface,
      paddingHorizontal: 13,
      paddingVertical: 11,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      shadowColor: '#01234D',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.09,
      shadowRadius: 12,
      elevation: 4,
    },
    dockIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
    dockCopy: { flex: 1, minWidth: 0, gap: 1 },
    dockEyebrow: { color: tokens.accent, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.8 },
    dockTitle: { color: tokens.text, fontSize: 14, lineHeight: 18, fontWeight: '900' },
    dockBody: { color: tokens.textMuted, fontSize: 10.5, lineHeight: 14 },
    pressed: { opacity: 0.8 },
  });
}
