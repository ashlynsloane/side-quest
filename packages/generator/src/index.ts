import type { GenerationContext, GenerationResult, WorkoutGenerationRequest } from '@circuit/domain';
import { generateWorkout as generateWorkoutCore } from './core';
import {
  equipmentIdsForTrainingSpace,
  trainingSpaceExerciseScore,
  type TrainingSpaceProfile,
} from './training-space';

export * from './core';
export * from './training-environment';
export * from './training-space';

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

/**
 * Generates several deterministic legal workouts inside one exact training
 * space, then selects the workout that makes best use of that space.
 *
 * The core generator remains unchanged: safety restrictions, recovery rules,
 * station architecture, and exercise compatibility are still authoritative.
 * Training-space value is a workout-level selection criterion after those
 * constraints are satisfied, which keeps location from bypassing physiology.
 */
export function generateWorkoutForTrainingSpace(
  request: WorkoutGenerationRequest,
  context: GenerationContext,
  targetSpace: TrainingSpaceProfile,
  homeSpace?: TrainingSpaceProfile,
): GenerationResult {
  const normalized = normalizeStationDensity({
    ...request,
    availableEquipment: equipmentIdsForTrainingSpace(targetSpace),
  });
  const baseSeed = request.randomSeed ?? `${targetSpace.id}-${request.workMinutes}`;
  let best: GenerationResult | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  let lastFailure: GenerationResult | undefined;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = generateWorkoutCore({
      ...normalized,
      randomSeed: `${baseSeed}:training-space:${attempt}`,
    }, context);

    if (!result.ok) {
      lastFailure = result;
      continue;
    }

    const exercises = result.workout.stations.flatMap((station) =>
      station.exercises.map((item) => item.exerciseSnapshot),
    );
    const score = exercises.reduce(
      (sum, exercise) => sum + trainingSpaceExerciseScore(exercise, targetSpace, homeSpace),
      0,
    );

    if (!best || score > bestScore) {
      best = result;
      bestScore = score;
    }
  }

  return best ?? lastFailure ?? generateWorkoutCore(normalized, context);
}
