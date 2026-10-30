import type { PerformanceGoal } from '@circuit/domain';

/**
 * Scheduling availability is not evidence of current, completed training.
 * This data is an input to a provisional workout generator only; it cannot
 * be used to approve a completed-week progression baseline.
 */
export interface ResolvedFirstWeekCapacity {
  totalWeeklyHours: number;
  currentEnduranceHours: number;
  runStatus: 'normal' | 'reduced' | 'return_to_run' | 'not_running';
  boneStressInjuryHistory: 'none' | 'remote' | 'recent_or_current';
  evidence: 'provisional_availability' | 'athlete_reported' | 'source_observed' | 'unknown';
  needsRecentTrainingReview: boolean;
}
export function resolveFirstWeekCapacity(goal: PerformanceGoal): ResolvedFirstWeekCapacity {
  const capacity = goal.capacityProfile;
  if (capacity) {
    const trainingEvidence = capacity.enduranceHoursEvidence;
    const evidence: ResolvedFirstWeekCapacity['evidence'] =
      trainingEvidence === 'source_observed' ? 'source_observed'
        : trainingEvidence === 'athlete_reported' ? 'athlete_reported'
          : trainingEvidence === 'unverified_planning_assumption'
            ? 'provisional_availability' : 'unknown';
    return {
      totalWeeklyHours: Math.max(0, capacity.totalWeeklyHours),
      currentEnduranceHours: Math.max(0, capacity.currentEnduranceHours),
      runStatus: capacity.runStatus,
      boneStressInjuryHistory: capacity.boneStressInjuryHistory,
      evidence, needsRecentTrainingReview: evidence !== 'source_observed',
    };
  }
  // Existing legacy plans can lack any athlete-capacity profile. The previous
  // mobile fallback silently invented eight hours available, five hours of
  // current endurance training, and unrestricted running. Do not resurrect it.
  return {
    totalWeeklyHours: Math.max(0, goal.sessionsPerWeek * goal.defaultSessionMinutes / 60),
    currentEnduranceHours: 0,
    runStatus: 'not_running',
    boneStressInjuryHistory: 'none',
    evidence: 'unknown', needsRecentTrainingReview: true,
  };
}
