import { describe, expect, it } from 'vitest';

import { exerciseSeed } from '@circuit/exercise-content';
import type {
  Exercise,
  WorkoutGenerationRequest,
} from '@circuit/domain';

import { hasExerciseRedundancyConflict } from '../src/core';

function exercise(name: string): Exercise {
  const match = exerciseSeed.find((item) => item.name === name);
  expect(match, `${name} should exist`).toBeDefined();
  return match!;
}

function request(
  focusTargets: WorkoutGenerationRequest['focusTargets'] = [],
): WorkoutGenerationRequest {
  return {
    workMinutes: 40,
    allowedStationMinutes: [4, 6, 8, 12],
    restSeconds: 60,
    exercisesPerStation: 3,
    focusTargets,
    excludedRegions: [],
    excludedMovementTags: [],
    availableEquipment: [],
    workoutStyle: 'strength_cardio_amrap',
    difficulty: 'intermediate',
    maximumImpact: 4,
    recoveryAware: true,
    avoidPreviousWorkoutExercises: false,
    favorFamiliarExercises: false,
    allowUnfamiliarExercises: true,
    minimizeEquipmentChanges: false,
  };
}

describe('exercise redundancy', () => {
  it('blocks equipment variants from the same progression family', () => {
    expect(
      hasExerciseRedundancyConflict(
        exercise('Barbell Romanian Deadlift'),
        [exercise('Dumbbell Romanian Deadlift')],
        request(),
      ),
    ).toBe(true);
  });

  it('blocks forward and reverse loaded lunges as same-family alternatives', () => {
    expect(
      hasExerciseRedundancyConflict(
        exercise('Kettlebell Reverse Lunge'),
        [exercise('Kettlebell Forward Lunge')],
        request(),
      ),
    ).toBe(true);
  });

  it('allows hip-hinge strength with hamstring knee-flexion work', () => {
    expect(
      hasExerciseRedundancyConflict(
        exercise('Slider Hamstring Curl'),
        [exercise('Dumbbell Romanian Deadlift')],
        request(),
      ),
    ).toBe(false);
  });

  it('normally prevents two calf-strength exercises from consuming separate slots', () => {
    expect(
      hasExerciseRedundancyConflict(
        exercise('Seated Calf Raise'),
        [exercise('Standing Calf Raise')],
        request(),
      ),
    ).toBe(true);
  });

  it('allows distinct calf functions when lower-leg work is explicitly emphasized', () => {
    const standing = exercise('Standing Calf Raise');
    const seated = exercise('Seated Calf Raise');

    const sharedRegion = standing.bodyRegions
      .filter((load) => load.load >= 2)
      .map((load) => load.region)
      .find((region) =>
        seated.bodyRegions.some(
          (load) => load.region === region && load.load >= 2,
        ),
      );

    expect(sharedRegion).toBeDefined();

    expect(
      hasExerciseRedundancyConflict(
        seated,
        [standing],
        request([
          {
            region: sharedRegion!,
            emphasis: 'strong',
          },
        ]),
      ),
    ).toBe(false);
  });

  it('still blocks the exact same calf progression family even with calf focus', () => {
    const standing = exercise('Standing Calf Raise');
    const weighted = exercise('Weighted Standing Calf Raise');

    const sharedRegion = standing.bodyRegions
      .filter((load) => load.load >= 2)
      .map((load) => load.region)
      .find((region) =>
        weighted.bodyRegions.some(
          (load) => load.region === region && load.load >= 2,
        ),
      );

    expect(sharedRegion).toBeDefined();

    expect(
      hasExerciseRedundancyConflict(
        weighted,
        [standing],
        request([
          {
            region: sharedRegion!,
            emphasis: 'strong',
          },
        ]),
      ),
    ).toBe(true);
  });

  it('does not treat calf strength and pogo elasticity as redundant', () => {
    expect(
      hasExerciseRedundancyConflict(
        exercise('Alternating Pogo Hop'),
        [exercise('Standing Calf Raise')],
        request(),
      ),
    ).toBe(false);
  });
});
