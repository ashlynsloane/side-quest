import type { GenerationContext, GenerationResult, WorkoutGenerationRequest } from '@circuit/domain';
import { generateWorkout as generateWorkoutCore } from './core';

export * from './core';

/**
 * Protect long AMRAP stations from becoming repetitive two-movement grinders.
 *
 * - A 12-minute station is never paired with a two-exercise prescription.
 * - Explicit two-exercise workouts keep that structure by using 4/8-minute stations
 *   whenever those durations are available.
 * - Mixed/default workouts that allow 12-minute stations use three exercises for
 *   the longer station format (4-minute stations remain two exercises in core).
 */
export function normalizeStationDensity(
  request: WorkoutGenerationRequest,
): WorkoutGenerationRequest {
  if (!request.allowedStationMinutes.includes(12)) return request;

  if (request.exercisesPerStation === 2) {
    const shorterDurations = request.allowedStationMinutes.filter((minutes) => minutes !== 12);
    if (shorterDurations.length > 0) {
      return {
        ...request,
        allowedStationMinutes: shorterDurations,
      };
    }
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
