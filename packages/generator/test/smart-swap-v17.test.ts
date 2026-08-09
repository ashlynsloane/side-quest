import { describe, expect, it } from 'vitest';
import { exerciseSeed } from '@circuit/exercise-content';
import type { WorkoutGenerationRequest } from '@circuit/domain';
import { generateWorkout, listExerciseSwapCandidates, swapExerciseInWorkout } from '../src/index';

const request: WorkoutGenerationRequest = {
  workMinutes: 40,
  allowedStationMinutes: [4, 6, 8, 12],
  restSeconds: 60,
  exercisesPerStation: 'mixed',
  focusTargets: [],
  excludedRegions: [],
  excludedMovementTags: [],
  availableEquipment: ['dumbbell','kettlebell','long_band','mini_band','bench','box','bosu','slider'],
  workoutStyle: 'strength_cardio_amrap',
  difficulty: 'intermediate',
  maximumImpact: 4,
  recoveryAware: true,
  avoidPreviousWorkoutExercises: true,
  favorFamiliarExercises: false,
  allowUnfamiliarExercises: true,
  minimizeEquipmentChanges: false,
  randomSeed: 'v17-smart-swap',
};

describe('V17 Smart Swap choices', () => {
  it('returns several unique full-workout-compatible choices', () => {
    const result = generateWorkout(request, { exercises: exerciseSeed });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const station = result.workout.stations[0]!;
    const original = station.exercises[0]!;
    const choices = listExerciseSwapCandidates({
      workout: result.workout,
      stationId: station.id,
      exerciseId: original.exerciseId,
      reason: 'variety',
      context: { exercises: exerciseSeed },
    });
    expect(choices.ok).toBe(true);
    if (!choices.ok) return;
    expect(choices.candidates.length).toBeGreaterThanOrEqual(3);
    expect(choices.candidates.length).toBeLessThanOrEqual(5);
    expect(new Set(choices.candidates.map((item) => item.id)).size).toBe(choices.candidates.length);
  });

  it('applies the exact candidate selected by the athlete', () => {
    const result = generateWorkout(request, { exercises: exerciseSeed });
    if (!result.ok) throw new Error(result.messages.join(' '));
    const station = result.workout.stations[0]!;
    const original = station.exercises[0]!;
    const choices = listExerciseSwapCandidates({ workout:result.workout, stationId:station.id, exerciseId:original.exerciseId, reason:'variety', context:{exercises:exerciseSeed} });
    if (!choices.ok) throw new Error(choices.message);
    const selected = choices.candidates.at(-1)!;
    const swapped = swapExerciseInWorkout({ workout:result.workout, stationId:station.id, exerciseId:original.exerciseId, reason:'variety', candidateId:selected.id, context:{exercises:exerciseSeed} });
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(swapped.replacement.id).toBe(selected.exercise.id);
  });

  it('does not offer exercises already present in the workout', () => {
    const result = generateWorkout(request, { exercises: exerciseSeed });
    if (!result.ok) throw new Error(result.messages.join(' '));
    const station = result.workout.stations[0]!;
    const original = station.exercises[0]!;
    const used = new Set(result.workout.stations.flatMap((item) => item.exercises.map((exercise) => exercise.exerciseId)).filter((id) => id !== original.exerciseId));
    const choices = listExerciseSwapCandidates({ workout:result.workout, stationId:station.id, exerciseId:original.exerciseId, reason:'variety', context:{exercises:exerciseSeed} });
    expect(choices.ok).toBe(true);
    if (!choices.ok) return;
    expect(choices.candidates.some((item) => used.has(item.exercise.id))).toBe(false);
  });
});
