import type { EquipmentId, GenerationContext, GenerationResult, WorkoutGenerationRequest } from '@circuit/domain';
import { generateWorkout as generateBaseWorkout } from './index';
import {
  gymOpportunityShare,
  trainingEnvironmentScore,
  type TrainingEnvironmentProfile,
} from './training-environment';

export * from './index';
export * from './training-environment';

const GYM_SIGNAL_EQUIPMENT = new Set<EquipmentId>([
  'barbell',
  'weight_plate',
  'trap_bar',
  'cable_machine',
  'leg_press',
]);

function inferredProfile(request: WorkoutGenerationRequest): TrainingEnvironmentProfile | null {
  const hasGymSignal = request.availableEquipment.some((item) => GYM_SIGNAL_EQUIPMENT.has(item));
  if (!hasGymSignal) return null;

  return {
    environment: 'gym',
    availableEquipment: [...request.availableEquipment],
    homeEquipment: request.availableEquipment.filter((item) => !GYM_SIGNAL_EQUIPMENT.has(item)),
  };
}

function workoutEnvironmentScore(
  result: Extract<GenerationResult, { ok: true }>,
  profile: TrainingEnvironmentProfile,
): number {
  const exercises = result.workout.stations.flatMap((station) =>
    station.exercises.map((item) => item.exerciseSnapshot),
  );

  const exerciseScore = exercises.reduce(
    (sum, exercise) => sum + trainingEnvironmentScore(exercise, profile),
    0,
  );

  if (profile.environment !== 'gym') return exerciseScore;

  // The share bonus makes a gym session use the reason the athlete went to the gym:
  // machines, cables, racks, barbells, trap bars, and other gym-only loading options.
  return exerciseScore + gymOpportunityShare(exercises, profile) * 100;
}

export function generateWorkoutForEnvironment(
  request: WorkoutGenerationRequest,
  context: GenerationContext,
  profile: TrainingEnvironmentProfile,
): GenerationResult {
  const availableEquipment = profile.environment === 'home'
    ? profile.availableEquipment
    : request.availableEquipment;

  const baseSeed = request.randomSeed ?? `${Date.now()}-${request.workMinutes}`;
  const attempts = profile.environment === 'custom' ? 1 : 12;
  let best: Extract<GenerationResult, { ok: true }> | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  let lastFailure: GenerationResult | undefined;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = generateBaseWorkout(
      {
        ...request,
        availableEquipment: [...availableEquipment],
        randomSeed: attempt === 0 ? baseSeed : `${baseSeed}:environment:${profile.environment}:${attempt}`,
      },
      context,
    );

    if (!result.ok) {
      lastFailure = result;
      continue;
    }

    const score = workoutEnvironmentScore(result, profile);
    if (!best || score > bestScore) {
      best = result;
      bestScore = score;
    }
  }

  return best ?? lastFailure ?? generateBaseWorkout(request, context);
}

// Backward-compatible public entry point. Existing callers do not need to change.
// When the equipment list clearly represents a full gym, Side Quest automatically
// chooses the valid workout that makes the best use of gym-only opportunities.
export function generateWorkout(
  request: WorkoutGenerationRequest,
  context: GenerationContext,
): GenerationResult {
  const profile = inferredProfile(request);
  if (!profile) return generateBaseWorkout(request, context);
  return generateWorkoutForEnvironment(request, context, profile);
}
