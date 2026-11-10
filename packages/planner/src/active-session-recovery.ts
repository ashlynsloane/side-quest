import type { GeneratedWorkout, TrainingCheckIn } from '@circuit/domain';
import type { DailyTrainingCeiling, TrainingRegion } from './daily-training-guardrails';
import { affectedTrainingRegions } from './training-region-inference';
import { requiresActiveWorkoutPause } from './active-workout-restriction';

export interface ActiveSessionRecoveryDecision {
  pause: boolean;
  reasons: string[];
  affectedRegions: TrainingRegion[];
}

/**
 * Evaluate a workout that was already authorized, using fresh regional data.
 * A changed Achilles/back restriction must not be invisible just because the
 * user originally entered through a valid workout preview.
 *
 * This supplements the explicit no-training and significant-pain check, not
 * diagnostic clearance or a model of safe tissue load.
 */
export function evaluateActiveSessionRecovery(
  workout: GeneratedWorkout,
  startedAt: string,
  checkIn: TrainingCheckIn | null,
  ceiling: DailyTrainingCeiling | null,
): ActiveSessionRecoveryDecision {
  const regions = affectedTrainingRegions(workout);
  const reasons: string[] = [];
  const began = Date.parse(startedAt);
  if (!Number.isFinite(began)) reasons.push('Workout start timestamp is invalid.');
  if (requiresActiveWorkoutPause(checkIn)) {
    reasons.push('A current symptom check-in restricts continued training.');
  }
  if (ceiling?.pauseTraining) {
    reasons.push('A current training pause applies to this session.');
  }
  const activeRegions = [...new Set<TrainingRegion>([...regions, 'general'])];
  for (const region of activeRegions) {
    const status = ceiling?.recovery?.[region];
    if (status === 'red_flag' || status === 'worse') {
      reasons.push(`Updated ${region.replaceAll('_', ' ')} recovery indicates symptoms requiring a pause.`);
    } else if (status === 'uncertain') {
      const observed = Date.parse(ceiling?.recoveryObservedAt?.[region] ?? '');
      if (Number.isFinite(observed) && observed > began) {
        reasons.push(`A new ${region.replaceAll('_', ' ')} check-in is uncertain. Review recovery before continuing.`);
      }
    }
  }
  return { pause: reasons.length > 0, reasons, affectedRegions: activeRegions };
}
