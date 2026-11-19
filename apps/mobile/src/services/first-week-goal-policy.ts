import type { PerformanceGoal } from '@circuit/domain';

/**
 * Race priority is meaningful for a competition goal, not an off-season
 * general-strength goal. The domain schema still requires a priority value,
 * so use its neutral `perform` compatibility value without showing an
 * A/B/C race-priority control or claiming the athlete chose B.
 */
export function firstWeekUsesRacePriority(goal: string): boolean {
  return goal !== 'general_offseason';
}

export function firstWeekPriorityForGoal(
  goal: string,
  priority: PerformanceGoal['priority'],
): PerformanceGoal['priority'] {
  return firstWeekUsesRacePriority(goal) ? priority : 'perform';
}

export function firstWeekGoalReviewLabel(
  goal: string,
  label: string,
  priority: PerformanceGoal['priority'],
): string {
  if (!firstWeekUsesRacePriority(goal)) return label;
  const rank = priority === 'race' ? 'A' : priority === 'finish' ? 'C' : 'B';
  return `${label} · ${rank} race priority`;
}
