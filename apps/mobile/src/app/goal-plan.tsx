import type { TrainingBlockPlan } from '@circuit/domain';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import LegacyGoalPlanScreen from '@/components/legacy-goal-plan-screen';
import { getLatestTrainingBlock } from '@/services/database';
import { refreshLatestWholeAthletePlan } from '@/services/whole-athlete-plan-runtime';

const PLAN_WATCH_INTERVAL_MS = 1000;

export default function GoalPlanScreen() {
  useCanonicalWholeAthletePlan();
  return <LegacyGoalPlanScreen />;
}

function useCanonicalWholeAthletePlan(): void {
  const lastSignature = useRef<string | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    let checking = false;

    const check = async () => {
      if (!live || checking) return;
      checking = true;
      try {
        const saved = await getLatestTrainingBlock();
        const signature = blockSignature(saved?.block ?? null);
        if (lastSignature.current === signature) return;
        lastSignature.current = signature;
        await refreshLatestWholeAthletePlan();
      } catch {
        // The setup screen owns generation errors. Canonical planning retries on the
        // next block change, Plan focus, or integration refresh.
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
        variant: session.workout.variantLevel,
      })),
    })),
  });
}
