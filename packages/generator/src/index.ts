import type { GenerationContext, GenerationResult, WorkoutGenerationRequest } from '@circuit/domain';
import { generateWorkout as generateWorkoutCore } from './core';

export * from './core';

/**
 * Protect long AMRAP stations from becoming repetitive grinders.
 *
 * Ordinary mixed/random workouts use 4- and 8-minute stations when those
 * durations are available. A 12-minute AMRAP is reserved for an explicitly
 * three-exercise structure. If 12 minutes is the only allowed duration, the
 * request is automatically promoted to three exercises rather than permitting
 * a two-movement 12-minute loop.
 */
export function normalizeStationDensity(
  request: WorkoutGenerationRequest,
): WorkoutGenerationRequest {
  if (!request.allowedStationMinutes.includes(12)) return request;
  if (request.exercisesPerStation === 3) return request;

  const shorterDurations = request.allowedStationMinutes.filter((minutes) => minutes !== 12);
  if (shorterDurations.length > 0) {
    return {
      ...request,
      allowedStationMinutes: shorterDurations,
    };
  }

  return {
    ...request,
    exercisesPerStation: 3,
  };
}

export function generateWorkout(
  request: WorkoutGenerationRequest,
  context: GenerationContext,
): GenerationResult {
  return generateWorkoutCore(normalizeStationDensity(request), context);
}
