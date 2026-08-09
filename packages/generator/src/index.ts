import type { GenerationContext, GenerationResult, WorkoutGenerationRequest } from '@circuit/domain';
import { generateWorkout as generateWorkoutCore } from './core';

export * from './core';

/**
 * Station Architecture V2.
 *
 * Station duration is a density tool, not a fixed workout taxonomy:
 * - 4 minutes is compact.
 * - 6 minutes supports two or three movements.
 * - 8 minutes generally supports a fuller station.
 * - 12 minutes is reserved for three-movement structures.
 *
 * Explicit two-exercise requests do not receive a 12-minute station when
 * shorter durations are available. Mixed workouts may still use 12 minutes;
 * core generation guarantees that every 12-minute station has three movements.
 */
export function normalizeStationDensity(
  request: WorkoutGenerationRequest,
): WorkoutGenerationRequest {
  if (!request.allowedStationMinutes.includes(12)) return request;
  if (request.exercisesPerStation === 3) return request;

  const shorterDurations = request.allowedStationMinutes.filter(
    (minutes) => minutes !== 12,
  );

  if (request.exercisesPerStation === 2) {
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

  if (shorterDurations.length === 0) {
    return {
      ...request,
      exercisesPerStation: 3,
    };
  }

  return request;
}

export function generateWorkout(
  request: WorkoutGenerationRequest,
  context: GenerationContext,
): GenerationResult {
  return generateWorkoutCore(normalizeStationDensity(request), context);
}
