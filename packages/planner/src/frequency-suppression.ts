import type { DisciplineFrequencyTarget, TrainableDiscipline } from './whole-athlete-week';

export type DisciplineCountMap = Partial<Record<TrainableDiscipline, number>>;
export type FrequencyTargetMap = Partial<Record<TrainableDiscipline, DisciplineFrequencyTarget>>;

/**
 * Athlete-approved skips and cross-sport replacements are not debts to repay.
 * This lowers only the affected discipline's target for the current week so
 * the planner does not silently recreate the removed session elsewhere.
 */
export function applyApprovedFrequencySuppression(
  existing: FrequencyTargetMap,
  originallyPlanned: DisciplineCountMap,
  suppressed: DisciplineCountMap,
): FrequencyTargetMap {
  const next: FrequencyTargetMap = { ...existing };
  for (const discipline of ['swim', 'bike', 'run', 'strength'] as const) {
    const removed = Math.max(0, Math.round(suppressed[discipline] ?? 0));
    if (removed === 0) continue;
    const original = Math.max(0, Math.round(originallyPlanned[discipline] ?? 0));
    const target = Math.max(0, original - removed);
    next[discipline] = { min: target, preferred: target, max: target };
  }
  return next;
}
