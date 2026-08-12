export type ActiveWorkoutCompletionSaveState = 'idle' | 'saving' | 'saved' | 'error';

export function activeWorkoutCompletionRecordId(
  workoutId: string,
  startedAt: string,
): string {
  const safeWorkout = workoutId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 72) || 'workout';
  const safeStartedAt = startedAt.replace(/[^0-9]/g, '').slice(0, 17) || 'unknown_start';
  return `active_${safeWorkout}_${safeStartedAt}`;
}

export function activeWorkoutCompletionFraction(
  elapsedSeconds: number,
  plannedSeconds: number,
): number {
  if (!Number.isFinite(plannedSeconds) || plannedSeconds <= 0) return 0;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  return Math.max(0, Math.min(1, elapsedSeconds / plannedSeconds));
}

export function completionSaveEyebrow(
  state: ActiveWorkoutCompletionSaveState,
): string {
  if (state === 'saving') return 'SAVING WORKOUT';
  if (state === 'error') return 'SAVE NEEDS ATTENTION';
  if (state === 'saved') return 'WORKOUT SAVED';
  return 'FINISHING WORKOUT';
}
