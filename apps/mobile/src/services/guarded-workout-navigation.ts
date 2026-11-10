import type { PlannedStrengthSession, TrainingBlockPlan } from '@circuit/domain';

export type RecommendedTrainingRoute =
  | { kind: 'scheduled_today'; session: PlannedStrengthSession }
  | { kind: 'upcoming_plan'; session: PlannedStrengthSession }
  | { kind: 'build' };

export function todayLocalDate(now = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid device date');
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Only today's genuine planned session can be entered as a scheduled workout.
 * Future plans open the calendar and should never become ad-hoc sessions
 * through the Train tab's recommended-start shortcut.
 */
export function resolveRecommendedTrainingRoute(
  block: TrainingBlockPlan | null,
  date = todayLocalDate(),
): RecommendedTrainingRoute {
  const sessions = block?.weeks.flatMap((week) => week.sessions).filter(
    (session) => session.date >= date &&
      session.completionStatus !== 'completed' &&
      session.completionStatus !== 'skipped',
  ).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order) ?? [];
  const next = sessions[0];
  if (!next) return { kind: 'build' };
  return next.date === date
    ? { kind: 'scheduled_today', session: next }
    : { kind: 'upcoming_plan', session: next };
}

export interface RecommendedTrainingNavigator {
  openPlannedWorkoutPreview(session: PlannedStrengthSession): void;
  navigate(path: '/workout-preview' | '/(tabs)/plan' | '/generate'): void;
}

export function navigateRecommendedTraining(
  decision: RecommendedTrainingRoute,
  navigator: RecommendedTrainingNavigator,
): void {
  if (decision.kind === 'scheduled_today') {
    // Preserve the plan session ID, date, and original prescription.
    navigator.openPlannedWorkoutPreview(decision.session);
    navigator.navigate('/workout-preview');
  } else {
    navigator.navigate(decision.kind === 'upcoming_plan' ? '/(tabs)/plan' : '/generate');
  }
}
