import { describe, expect, it } from 'vitest';
import { exerciseSeed } from '@circuit/exercise-content';
import type { Exercise, WorkoutGenerationRequest } from '@circuit/domain';
import { calculateRecentLoad, createReentryWorkout, createWorkoutVariant, generateWorkout, swapExerciseInWorkout } from '../src/index';

const baseRequest: WorkoutGenerationRequest = {
  workMinutes: 40,
  allowedStationMinutes: [4, 6, 8, 12],
  restSeconds: 60,
  exercisesPerStation: 2,
  focusTargets: [{ region: 'hamstrings', emphasis: 'moderate' }],
  excludedRegions: [],
  excludedMovementTags: [],
  availableEquipment: [
    'dumbbell', 'kettlebell', 'long_band', 'mini_band', 'bench', 'box', 'bosu',
  ],
  workoutStyle: 'strength_cardio_amrap',
  difficulty: 'intermediate',
  maximumImpact: 4,
  recoveryAware: true,
  avoidPreviousWorkoutExercises: true,
  favorFamiliarExercises: false,
  allowUnfamiliarExercises: true,
  minimizeEquipmentChanges: false,
  randomSeed: 'test-seed',
};

describe('generateWorkout', () => {
  it('generates exactly the requested amount of work', () => {
    const result = generateWorkout(baseRequest, { exercises: exerciseSeed });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workout.totalWorkSeconds).toBe(40 * 60);
    expect(result.workout.stations.length).toBeGreaterThanOrEqual(3);
    expect(result.workout.stations.length).toBeLessThanOrEqual(6);
  });

  it('uses only bodyweight when no equipment is available', () => {
    const result = generateWorkout(
      {
        ...baseRequest,
        workMinutes: 24,
        availableEquipment: [],
        focusTargets: [{ region: 'core_anterior', emphasis: 'moderate' }],
        randomSeed: 'bodyweight-test',
      },
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const station of result.workout.stations) {
      for (const item of station.exercises) {
        const option = item.exerciseSnapshot.equipmentOptions.find(
          (candidate) => candidate.id === item.equipmentOptionId,
        );
        expect(option?.items.every((equipment) => equipment.equipmentId === 'bodyweight')).toBe(true);
      }
    }
  });

  it('respects a hard shoulder exclusion', () => {
    const result = generateWorkout(
      { ...baseRequest, excludedRegions: ['shoulders', 'shoulder'], randomSeed: 'no-shoulder' },
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const station of result.workout.stations) {
      for (const item of station.exercises) {
        expect(item.exerciseSnapshot.bodyRegions.some((load) => load.region === 'shoulders' && load.load >= 2)).toBe(false);
        expect(item.exerciseSnapshot.jointLoads.some((load) => load.region === 'shoulder' && load.load >= 2)).toBe(false);
      }
    }
  });

  it('preserves a full hotel-gym workout while protecting a localized rhomboid area', () => {
    const result = generateWorkout(
      {
        ...baseRequest,
        workMinutes: 40,
        focusTargets: [],
        availableEquipment: ['dumbbell', 'bench', 'box', 'stairs'],
        regionRestrictions: [
          { region: 'upper_back', mode: 'direct_only' },
          { region: 'thoracic_spine', mode: 'direct_only' },
        ],
        excludedMovementPatterns: ['horizontal_pull'],
        randomSeed: 'localized-rhomboid-hotel-gym',
      },
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workout.totalWorkSeconds).toBe(40 * 60);
    const exercises = result.workout.stations.flatMap((station) => station.exercises.map((item) => item.exerciseSnapshot));
    expect(exercises.some((exercise) => exercise.movementPatterns.includes('horizontal_pull'))).toBe(false);
    expect(exercises.some((exercise) => exercise.bodyRegions.some((load) => load.region === 'upper_back' && load.role === 'primary' && load.load >= 2))).toBe(false);
    expect(exercises.some((exercise) => exercise.bodyRegions.some((load) => ['chest', 'shoulders', 'biceps', 'triceps'].includes(load.region) && load.load >= 2))).toBe(true);
  });

  it('keeps lower-load options available for a keep-light restriction', () => {
    const result = generateWorkout(
      { ...baseRequest, focusTargets: [], regionRestrictions: [{ region: 'shoulders', mode: 'keep_light' }], randomSeed: 'shoulder-keep-light' },
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const exercises = result.workout.stations.flatMap((station) => station.exercises);
    expect(exercises.some((item) => item.exerciseSnapshot.bodyRegions.some((load) => load.region === 'shoulders' && load.load >= 4))).toBe(false);
  });

  it('removes jumping exercises when jumping is excluded', () => {
    const result = generateWorkout(
      { ...baseRequest, excludedMovementTags: ['jumping'], randomSeed: 'no-jumping' },
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const exercises = result.workout.stations.flatMap((station) => station.exercises);
    expect(exercises.some((item) => item.exerciseSnapshot.avoidanceTags.includes('jumping'))).toBe(false);
  });

  it('limits four-minute stations to two exercises', () => {
    const result = generateWorkout(
      { ...baseRequest, exercisesPerStation: 3, randomSeed: 'short-station-count' },
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const station of result.workout.stations.filter((item) => item.durationSeconds === 240)) {
      expect(station.exercises).toHaveLength(2);
    }
  });

  it('does not place multiple unstable-surface exercises in one station', () => {
    const result = generateWorkout(
      { ...baseRequest, exercisesPerStation: 'mixed', randomSeed: 'unstable-pairing' },
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const station of result.workout.stations) {
      const unstableCount = station.exercises.filter((item) =>
        item.exerciseSnapshot.avoidanceTags.includes('unstable_surface'),
      ).length;
      expect(unstableCount).toBeLessThanOrEqual(1);
    }
  });


  it('creates reduced and minimum variants without changing the original', () => {
    const result = generateWorkout(baseRequest, { exercises: exerciseSeed });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reduced = createWorkoutVariant(result.workout, 'reduced');
    const minimum = createWorkoutVariant(result.workout, 'minimum');
    expect(reduced.totalWorkSeconds).toBeLessThan(result.workout.totalWorkSeconds);
    expect(minimum.totalWorkSeconds).toBeLessThanOrEqual(reduced.totalWorkSeconds);
    expect(result.workout.variantLevel).toBeUndefined();
  });

  it('swaps an exercise while preserving station size and avoiding duplicates', () => {
    const result = generateWorkout(baseRequest, { exercises: exerciseSeed });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const station = result.workout.stations[0];
    const original = station.exercises[0];
    const swapped = swapExerciseInWorkout({
      workout: result.workout,
      stationId: station.id,
      exerciseId: original.exerciseId,
      reason: 'variety',
      context: { exercises: exerciseSeed },
    });
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(swapped.workout.stations[0].exercises).toHaveLength(station.exercises.length);
    expect(swapped.replacement.id).not.toBe(original.exerciseId);
    const ids = swapped.workout.stations.flatMap((item) => item.exercises.map((exercise) => exercise.exerciseId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('accepts a user-added exercise as a compatible smart-swap candidate', () => {
    const result = generateWorkout(baseRequest, { exercises: exerciseSeed });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const station = result.workout.stations[0];
    const original = station.exercises[0];
    const custom: Exercise = {
      ...original.exerciseSnapshot,
      id: 'custom_test_swap',
      slug: 'custom-test-swap',
      name: 'Custom Test Swap',
      status: 'active',
      defaultEnabled: true,
      media: [],
      createdAt: '2026-07-17T00:00:00.000Z',
      updatedAt: '2026-07-17T00:00:00.000Z',
    };
    const swapped = swapExerciseInWorkout({
      workout: result.workout,
      stationId: station.id,
      exerciseId: original.exerciseId,
      reason: 'variety',
      context: { exercises: [custom] },
    });
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(swapped.replacement.id).toBe(custom.id);
    expect(swapped.workout.stations[0].exercises[0].exerciseSnapshot.name).toBe('Custom Test Swap');
  });

  it('uses a movement regression when an exercise is too hard', () => {
    const standing = exerciseSeed.find((exercise) => exercise.id === 'ex_standing_calf_raise');
    const single = exerciseSeed.find((exercise) => exercise.id === 'ex_single_leg_calf_raise');
    if (!standing || !single) throw new Error('Missing calf exercises');
    const result = generateWorkout(baseRequest, { exercises: exerciseSeed });
    if (!result.ok) throw new Error(result.messages.join(' '));
    const station = result.workout.stations[0];
    const original = station.exercises[0];
    const customWorkout = {
      ...result.workout,
      stations: result.workout.stations.map((item, index) => index === 0 ? {
        ...item,
        exercises: item.exercises.map((entry, entryIndex) => entryIndex === 0 ? {
          ...entry,
          exerciseId: single.id,
          exerciseSnapshot: single,
          equipmentOptionId: single.equipmentOptions[0]!.id,
          prescriptionId: single.prescriptions[0]!.id,
          target: single.prescriptions[0]!.target,
          unit: single.prescriptions[0]!.unit,
        } : entry),
      } : item),
    };
    const adapted = swapExerciseInWorkout({
      workout: customWorkout,
      stationId: station.id,
      exerciseId: single.id,
      reason: 'too_hard',
      context: { exercises: exerciseSeed },
    });
    expect(adapted.ok).toBe(true);
    if (!adapted.ok) return;
    expect(adapted.replacement.id).not.toBe(single.id);
    expect(adapted.replacement.impactLevel).toBeLessThanOrEqual(single.impactLevel);
    expect(adapted.workout.stations[0].exercises[0].adaptationNote).toContain('Regressed');
    expect(original).toBeDefined();
  });

  it('creates a reduced re-entry prescription after interrupted training', () => {
    const result = generateWorkout(baseRequest, { exercises: exerciseSeed });
    if (!result.ok) throw new Error(result.messages.join(' '));
    const reentry = createReentryWorkout(result.workout);
    expect(reentry.totalWorkSeconds).toBeLessThan(result.workout.totalWorkSeconds);
    expect(reentry.stations[0].exercises[0].target).toBeLessThanOrEqual(result.workout.stations[0].exercises[0].target);
    expect(reentry.variantLabel).toContain('Return');
  });


  it('keeps balanced workouts globally balanced across many random seeds', () => {
    const calfRegions = new Set(['gastrocnemius', 'soleus', 'tibialis_anterior', 'feet_ankles']);
    const corePatterns = new Set(['anti_rotation', 'anti_extension', 'rotation', 'trunk_flexion', 'lateral_flexion']);

    for (let index = 0; index < 40; index += 1) {
      const result = generateWorkout(
        {
          ...baseRequest,
          workMinutes: 48,
          exercisesPerStation: 'mixed',
          focusTargets: [],
          randomSeed: `balanced-quality-${index}`,
        },
        { exercises: exerciseSeed },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      const exercises = result.workout.stations.flatMap((station) =>
        station.exercises.map((item) => item.exerciseSnapshot));
      const calfCount = exercises.filter((exercise) => exercise.bodyRegions.some((load) =>
        calfRegions.has(load.region)
          && ((load.role === 'primary' && load.load >= 2)
            || (load.role === 'secondary' && load.load >= 3)))).length;
      expect(calfCount).toBeLessThanOrEqual(2);

      const substitutionGroups = exercises.flatMap((exercise) => exercise.substitutionGroupIds);
      expect(new Set(substitutionGroups).size).toBe(substitutionGroups.length);
      expect(exercises.some((exercise) => ['squat', 'lunge'].includes(exercise.movementPatterns[0]!))).toBe(true);
      expect(exercises.some((exercise) => exercise.movementPatterns[0] === 'hinge')).toBe(true);
      expect(exercises.some((exercise) => ['horizontal_push', 'vertical_push'].includes(exercise.movementPatterns[0]!))).toBe(true);
      expect(exercises.some((exercise) => ['horizontal_pull', 'vertical_pull'].includes(exercise.movementPatterns[0]!))).toBe(true);
      expect(exercises.some((exercise) => corePatterns.has(exercise.movementPatterns[0]!))).toBe(true);
    }
  });

  it('uses a 48-hour recovery window rather than a 72-hour window', () => {
    const recent = calculateRecentLoad({
      exercises: exerciseSeed,
      now: '2026-07-20T12:00:00.000Z',
      recentRegionExposures: [
        {
          region: 'glutes',
          rawExposure: 100,
          completedAt: '2026-07-18T11:00:00.000Z',
        },
      ],
    });
    expect(recent.size).toBe(0);
  });

  it('preserves balanced movement coverage despite recent regional loading', () => {
    const result = generateWorkout(
      {
        ...baseRequest,
        workMinutes: 48,
        exercisesPerStation: 'mixed',
        focusTargets: [],
        randomSeed: 'recovery-balanced-coverage',
      },
      {
        exercises: exerciseSeed,
        now: '2026-07-20T12:00:00.000Z',
        recentRegionExposures: ['glutes', 'quadriceps', 'core_anterior'].map((region) => ({
          region: region as 'glutes' | 'quadriceps' | 'core_anterior',
          rawExposure: 100,
          completedAt: '2026-07-19T16:00:00.000Z',
        })),
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const exercises = result.workout.stations.flatMap((station) =>
      station.exercises.map((item) => item.exerciseSnapshot));
    expect(exercises.some((exercise) => ['squat', 'lunge'].includes(exercise.movementPatterns[0]!))).toBe(true);
    expect(exercises.some((exercise) => exercise.movementPatterns[0] === 'hinge')).toBe(true);
    expect(result.workout.recentLoadAdjustments.every((message) => message.includes('48 hours'))).toBe(true);
  });

  it('cycles through fresh swap options instead of bouncing between two exercises', () => {
    const result = generateWorkout(
      { ...baseRequest, focusTargets: [], randomSeed: 'swap-cycle-quality' },
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    let workout = result.workout;
    const stationId = workout.stations[0]!.id;
    let current = workout.stations[0]!.exercises[0]!;
    const seen = new Set([current.exerciseId]);

    for (let index = 0; index < 4; index += 1) {
      const swapped = swapExerciseInWorkout({
        workout,
        stationId,
        exerciseId: current.exerciseId,
        reason: 'variety',
        context: { exercises: exerciseSeed },
      });
      expect(swapped.ok).toBe(true);
      if (!swapped.ok) return;
      expect(seen.has(swapped.replacement.id)).toBe(false);
      seen.add(swapped.replacement.id);
      workout = swapped.workout;
      current = workout.stations.find((station) => station.id === stationId)!.exercises
        .find((exercise) => exercise.order === current.order)!;
    }
  });

  it('can still generate a balanced bodyweight workout under tighter constraints', () => {
    const result = generateWorkout(
      {
        ...baseRequest,
        workMinutes: 24,
        focusTargets: [],
        availableEquipment: [],
        randomSeed: 'balanced-bodyweight-constrained',
      },
      { exercises: exerciseSeed },
    );
    expect(result.ok).toBe(true);
  });

});


describe('V24.2 workout identity', () => {
  it('creates a memorable deterministic name instead of a generic minute label', () => {
    const request: WorkoutGenerationRequest = { ...baseRequest, workMinutes: 40, availableEquipment: ['dumbbell', 'bench'], randomSeed: 'v24-2-name' };
    const first = generateWorkout(request, { exercises: exerciseSeed });
    const second = generateWorkout(request, { exercises: exerciseSeed });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.workout.name).toBe(second.workout.name);
    expect(first.workout.name).not.toMatch(/40-Minute|Strength-Cardio/i);
    expect(first.workout.name.length).toBeGreaterThan(5);
  });
});
