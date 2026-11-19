/**
 * Shared room clocks coordinate people; they do not prove an individual's
 * exercise. Never credit the time before this phone was safely active, time
 * spent in the background, or time after an athlete's safety hold.
 *
 * observedSafeSeconds must be accumulated ONLY from foreground frames after
 * the individual's current safety check passed. The result is an upper bound
 * on a completion-time proxy, never verified exercise dose.
 */
export function boundedSharedWorkoutFraction(
  requestedFraction: number,
  observedSafeSeconds: number,
  plannedSeconds: number,
): number {
  if (!Number.isFinite(requestedFraction)
    || !Number.isFinite(observedSafeSeconds)
    || !Number.isFinite(plannedSeconds)
    || observedSafeSeconds < 0 || plannedSeconds <= 0) {
    return 0;
  }
  const athleteObservedUpperBound = Math.min(1, observedSafeSeconds / plannedSeconds);
  return Math.max(0, Math.min(1, requestedFraction, athleteObservedUpperBound));
}
