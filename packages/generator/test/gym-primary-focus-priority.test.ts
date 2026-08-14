import { describe, expect, it } from 'vitest';

import { exerciseSeed } from '@circuit/exercise-content';
import type { WorkoutGenerationRequest } from '@circuit/domain';
import {
  classifyExerciseEnvironmentValue,
  createGymTrainingSpace,
  createHomeTrainingSpace,
  generateWorkoutForTrainingSpace,
} from '../src/public';

describe('gym primary-focus priority', () => {
  it('puts meaningful gym value into a primary lower-body strength slot when eligible', () => {
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

    const request: WorkoutGenerationRequest = {
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
      randomSeed: 'gym-primary-focus-regression',
    };

    const result = generateWorkoutForTrainingSpace(
      request,
      { exercises: exerciseSeed },
      gym,
      home,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const primaryLowerBodyGymExercises =
      result.workout.stations.flatMap((station) =>
        station.exercises.map((item) => item.exerciseSnapshot),
      ).filter((exercise) => {
        const environmentValue = classifyExerciseEnvironmentValue(exercise, {
          homeEquipment: home.capabilities.map((item) => item.equipmentId),
        });

        const meaningfulGymValue =
          environmentValue === 'gym_dependent'
          || environmentValue === 'gym_advantaged';

        const primaryStrength =
          exercise.stationRoles.includes('primary_strength');

        const targetsPrimaryFocus =
          exercise.bodyRegions.some(
            (load) =>
              load.region === 'quadriceps'
              && load.role === 'primary'
              && load.load >= 3,
          );

        return meaningfulGymValue && primaryStrength && targetsPrimaryFocus;
      });

    console.log(
      'Primary lower-body gym exercises:',
      primaryLowerBodyGymExercises.map((exercise) => exercise.name),
    );

    expect(primaryLowerBodyGymExercises.length).toBeGreaterThan(0);
  });
});
