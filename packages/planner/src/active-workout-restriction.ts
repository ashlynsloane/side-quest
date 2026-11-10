import type { TrainingCheckIn } from '@circuit/domain';

/**
 * Significant new pain or an explicit no-training restriction immediately
 * pauses an active workout. The severity >=4 threshold is a conservative
 * app policy, not clinical diagnostic or clearance guidance.
 */
export function requiresActiveWorkoutPause(checkIn: TrainingCheckIn | null): boolean {
  if (!checkIn || !checkIn.active) return false;
  return checkIn.status === 'unable_to_train'
    || (checkIn.status === 'tightness_pain' && checkIn.severity >= 4);
}
