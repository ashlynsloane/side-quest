/**
 * Workout authorization is not an indefinite ticket to add exercise.
 * This is a conservative app-session validity window, NOT a medical
 * threshold or clinical return-to-sport rule.
 */
export const LIVE_WORKOUT_AUTHORIZATION_MAX_HOURS = 8;

function dayKey(value: Date): string {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0')].join('-');
}

export function evaluateWorkoutAuthorizationAge(
  authorizedAt: string, now: Date = new Date(),
): { current: boolean; reason?: string } {
  const start = new Date(authorizedAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(now.getTime())) {
    return { current: false, reason: 'Workout authorization has an invalid timestamp.' };
  }
  const elapsed = now.getTime() - start.getTime();
  if (elapsed < 0) {
    return { current: false, reason: 'Device time precedes the workout authorization.' };
  }
  if (dayKey(now) !== dayKey(start)) {
    return { current: false, reason: 'This workout was authorized on a previous calendar day.' };
  }
  if (elapsed > LIVE_WORKOUT_AUTHORIZATION_MAX_HOURS * 60 * 60 * 1000) {
    return { current: false, reason: 'This workout authorization is too old to continue without review.' };
  }
  return { current: true };
}
