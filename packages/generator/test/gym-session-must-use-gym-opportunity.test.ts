import { describe, expect, it } from 'vitest';

import { exerciseSeed } from '@circuit/exercise-content';
import type { WorkoutGenerationRequest } from '@circuit/domain';
import {
  classifyExerciseEnvironmentValue,
  createGymTrainingSpace,
  createHomeTrainingSpace,
  generateWorkoutForTrainingSpace,
} from '../src/public';

describe('gym training-space behavior', () => {
  it('uses at least one gym-dependent or gym-advantaged movement when eligible options exist', () => {
    const home = createHomeTrainingSpace([
      { equipmentId: 'bodyweight' },
      { equipmentId: 'dumbbell', maxLoadLb: 35 },
      { equipmentId: 'mini_band' },
      { equipmentId: 'slider' },
      { equipmentId: 'bosu' },
      { equipmentId: 'medicine_ball' },
    ]);

    const gym = createGymTrainingSpace([
      ...home.capabilities,
      { equipmentId: 'barbell', maxLoadLb: 315 },
      { equipmentId: 'weight_plate', maxLoadLb: 315 },
      { equipmentId: 'cable_machine' },
      { equipmentId: 'hack_squat_machine' },
      { equipmentId: 'leg_extension_machine' },
      { equipmentId: 'leg_curl_machine' },
      { equipmentId: 'calf_raise_machine' },
      { equipmentId: 'row_machine' },
      { equipmentId: 'chest_press_machine' },
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
      randomSeed: 'gym-opportunity-regression',
    };

    const result = generateWorkoutForTrainingSpace(
      request,
      { exercises: exerciseSeed },
      gym,
      home,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const exercises = result.workout.stations.flatMap((station) =>
      station.exercises.map((item) => item.exerciseSnapshot),
    );

    const gymValueExercises = exercises.filter((exercise) => {
      const value = classifyExerciseEnvironmentValue(exercise, {
        homeEquipment: home.capabilities.map((item) => item.equipmentId),
      });

      return value === 'gym_dependent' || value === 'gym_advantaged';
    });

    const meaningfulGymStrengthExercises = gymValueExercises.filter(
      (exercise) =>
        exercise.stationRoles.some(
          (role) =>
            role === 'primary_strength'
            || role === 'secondary_strength',
        )
        && exercise.bodyRegions.some(
          (load) =>
            ['quadriceps', 'glutes', 'hamstrings'].includes(load.region)
            && (load.role === 'primary' || load.role === 'secondary'),
        ),
    );

    console.log(
      'Gym-value exercises:',
      gymValueExercises.map((exercise) => exercise.name),
    );

    console.log(
      'Meaningful lower-body gym strength:',
      meaningfulGymStrengthExercises.map((exercise) => exercise.name),
    );

    expect(
      meaningfulGymStrengthExercises.length,
    ).toBeGreaterThan(0);
  });
});
