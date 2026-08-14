import { describe, expect, it } from 'vitest';

import { exerciseSeed } from '@circuit/exercise-content';
import type { WorkoutGenerationRequest } from '@circuit/domain';
import {
  classifyExerciseEnvironmentValue,
  createGymTrainingSpace,
  createHomeTrainingSpace,
  generateWorkoutForTrainingSpace,
} from '../src/public';

describe('gym primary-focus robustness', () => {
  it('uses meaningful primary-focus gym strength across most seeds', () => {
    const home = createHomeTrainingSpace([
      { equipmentId: 'bodyweight' },
      { equipmentId: 'dumbbell', maxLoadLb: 35 },
      { equipmentId: 'mini_band' },
      { equipmentId: 'slider' },
      { equipmentId: 'bosu' },
      { equipmentId: 'medicine_ball' },
      { equipmentId: 'box' },
    ]);

    const gym = createGymTrainingSpace([
      ...home.capabilities,
      { equipmentId: 'barbell', maxLoadLb: 315 },
      { equipmentId: 'weight_plate', maxLoadLb: 315 },
      { equipmentId: 'cable_machine' },
      { equipmentId: 'leg_press' },
      { equipmentId: 'leg_curl_machine' },
      { equipmentId: 'leg_extension_machine' },
      { equipmentId: 'calf_raise_machine' },
    ]);

    const baseRequest: WorkoutGenerationRequest = {
      workMinutes: 52,
      allowedStationMinutes: [4, 6, 8, 12],
      restSeconds: 60,
      exercisesPerStation: 3,
      focusTargets: [
        { region: 'quadriceps', emphasis: 'strong' },
        { region: 'glutes', emphasis: 'moderate' },
        { region: 'hamstrings', emphasis: 'moderate' },
      ],
      excludedRegions: [],
      excludedMovementTags: [],
      availableEquipment: [],
      workoutStyle: 'strength_cardio_amrap',
      difficulty: 'intermediate',
      maximumImpact: 2,
      recoveryAware: true,
      avoidPreviousWorkoutExercises: false,
      favorFamiliarExercises: false,
      allowUnfamiliarExercises: true,
      minimizeEquipmentChanges: false,
    };

    let successful = 0;
    const failures: string[] = [];

    for (let index = 0; index < 30; index += 1) {
      const seed = `gym-primary-focus-${index}`;

      const result = generateWorkoutForTrainingSpace(
        { ...baseRequest, randomSeed: seed },
        { exercises: exerciseSeed },
        gym,
        home,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      const hasPrimaryGymFocus = result.workout.stations
        .flatMap((station) =>
          station.exercises.map((item) => item.exerciseSnapshot),
        )
        .some((exercise) => {
          const environmentValue =
            classifyExerciseEnvironmentValue(exercise, {
              homeEquipment: home.capabilities.map(
                (item) => item.equipmentId,
              ),
            });

          return (
            (
              environmentValue === 'gym_dependent'
              || environmentValue === 'gym_advantaged'
            )
            && exercise.stationRoles.includes('primary_strength')
            && exercise.bodyRegions.some(
              (load) =>
                load.region === 'quadriceps'
                && load.role === 'primary'
                && load.load >= 3,
            )
          );
        });

      if (hasPrimaryGymFocus) successful += 1;
      else failures.push(seed);
    }

    console.log(
      `Primary-focus gym success: ${successful}/30`,
    );
    console.log('Failed seeds:', failures);

    expect(successful).toBeGreaterThanOrEqual(27);
  });
});
