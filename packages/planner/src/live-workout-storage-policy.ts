/**
 * Never resolve live workout snapshots by a global key. Profile switching
 * must not restore or overwrite another athlete's active training state.
 * Older unscoped checkpoints cannot be safely attributed to an owner.
 */
export const LEGACY_LIVE_WORKOUT_KEY = 'sidequest.live-workout.session.v1';
export const LIVE_WORKOUT_KEY_PREFIX = 'sidequest.live-workout.session.v2.';

export function scopedLiveWorkoutStorageKey(athleteId: string): string {
  if (typeof athleteId !== 'string' || !athleteId.trim()) {
    throw new Error('An athlete ID is required for live workout persistence');
  }
  return `${LIVE_WORKOUT_KEY_PREFIX}${encodeURIComponent(athleteId)}`;
}
