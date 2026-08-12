import { describe, expect, it } from 'vitest';
import type { Exercise, GenerationResult, WorkoutGenerationRequest } from '@circuit/domain';
import {
  createGymTrainingSpace,
  createHomeTrainingSpace,
  workoutTrainingSpaceScore,
} from '../src/public';

function exercise(
  id: string,
  equipmentId: 'dumbbell' | 'leg_press' | 'bosu',
  role: 'primary_strength' | 'stability' = 'primary_strength',
): Exercise {
  return {
    id,
    slug: id,
    name: id,
    aliases: [],
    status: 'active',
    classification: 'equipment',
    category: 'test',
    shortDescription: 'test',
    instructions: { setup: [], execution: [], cues: [], commonMistakes: [] },
    bodyRegions: [],
    jointLoads: [],
    movementPatterns: ['squat'],
    avoidanceTags: [],
    laterality: 'bilateral',
    stationRoles: [role],
    equipmentOptions: [{ id: equipmentId, label: equipmentId, items: [{ equipmentId, quantity: equipmentId === 'dumbbell' ? 2 : 1 }] }],
    prescriptions: [],
    impactLevel: 0,
    balanceDemand: 0,
    cardiovascularDemand: 0,
    technicalComplexity: 0,
    suitableForAmrap: true,
    suitableForTravel: false,
    suitableForBeginners: true,
    substitutionGroupIds: [],
    compatibility: { maximumAppearancesPerWorkout: 1 },
    media: [],
    defaultEnabled: true,
    contentVersion: 1,
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
  };
}

const home = createHomeTrainingSpace([
  { equipmentId: 'dumbbell', quantity: 2, minLoadLb: 5, maxLoadLb: 25, adjustable: true },
  { equipmentId: 'bosu', quantity: 1 },
]);

const gym = createGymTrainingSpace([
  { equipmentId: 'dumbbell', quantity: 2, maxLoadLb: 100 },
  { equipmentId: 'leg_press', quantity: 1 },
]);

const request: WorkoutGenerationRequest = {
  workMinutes: 24,
  allowedStationMinutes: [8],
  restSeconds: 60,
  exercisesPerStation: 2,
  focusTargets: [],
  excludedRegions: [],
  excludedMovementTags: [],
  availableEquipment: [],
  workoutStyle: 'strength_amrap',
  difficulty: 'intermediate',
  maximumImpact: 4,
  recoveryAware: true,
  avoidPreviousWorkoutExercises: true,
  favorFamiliarExercises: true,
  allowUnfamiliarExercises: true,
  minimizeEquipmentChanges: false,
  randomSeed: 'space-test',
};

function resultWith(exercises: Exercise[]): Extract<GenerationResult, { ok: true }> {
  return {
    ok: true,
    workout: {
      id: 'test-workout',
      name: 'Test workout',
      createdAt: '2026-08-12T00:00:00.000Z',
      randomSeed: 'space-test',
      request,
      stations: [{
        id: 'station-1',
        order: 1,
        durationSeconds: 480,
        format: 'amrap',
        purpose: 'test',
        exercises: exercises.map((item, index) => ({
          exerciseId: item.id,
          exerciseSnapshot: item,
          equipmentOptionId: item.equipmentOptions[0].id,
          prescriptionId: 'test',
          target: 8,
          unit: 'total',
          order: index + 1,
        })),
      }],
      totalWorkSeconds: 480,
      totalRestSeconds: 0,
      estimatedElapsedSeconds: 480,
      requiredEquipment: [],
      targetRegions: [],
      recentLoadAdjustments: [],
      source: 'generated',
    },
  };
}

const heavyDb = exercise('heavy-db', 'dumbbell');
const legPress = exercise('leg-press', 'leg_press');
const bosu = exercise('bosu', 'bosu', 'stability');

describe('training-space workout selection', () => {
  it('prefers a gym-opportunity workout over a home-specialty workout at the gym', () => {
    const gymWorkout = resultWith([heavyDb, legPress]);
    const homeStyleWorkout = resultWith([heavyDb, bosu]);

    expect(workoutTrainingSpaceScore(gymWorkout, gym, home)).toBeGreaterThan(
      workoutTrainingSpaceScore(homeStyleWorkout, gym, home),
    );
  });

  it('uses the home profile to keep home-specialty work valuable at home', () => {
    const homeWorkout = resultWith([heavyDb, bosu]);
    const gymOnlyWorkout = resultWith([heavyDb, legPress]);

    expect(workoutTrainingSpaceScore(homeWorkout, home)).toBeGreaterThan(
      workoutTrainingSpaceScore(gymOnlyWorkout, home),
    );
  });
});
