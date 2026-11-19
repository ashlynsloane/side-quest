/**
 * Duration-equivalent credit for a completed planned workout.
 * An early-ended session must never be displayed as 100% of the prescription.
 * This is NOT independent stopwatch evidence: only the completion fraction
 * and planned duration are persisted for current local-first workouts.
 */
export function completedWorkoutSeconds(
  plannedSeconds: number, completionFraction: number,
): number {
  if (!Number.isFinite(plannedSeconds) || plannedSeconds <= 0) return 0;
  if (!Number.isFinite(completionFraction)) return 0;
  const fraction = Math.max(0, Math.min(1, completionFraction));
  return Math.round(plannedSeconds * fraction);
}
