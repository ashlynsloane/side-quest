import { describe, expect, it } from 'vitest';
import type { Exercise } from '@circuit/domain';
import {
  createGymTrainingSpace,
  createHomeTrainingSpace,
  equipmentIdsForTrainingSpace,
  loadCapacityAdvantage,
  trainingSpaceExerciseScore,
} from '../src/training-space';

function exercise(id: string, equipmentId: 'dumbbell' | 'bosu', role: 'primary_strength' | 'stability'): Exercise {
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
  { equipmentId: 'kettlebell', quantity: 1, minLoadLb: 25, maxLoadLb: 40, adjustable: true },
  { equipmentId: 'bench', quantity: 1 },
  { equipmentId: 'bosu', quantity: 1 },
  { equipmentId: 'slider', quantity: 2 },
  { equipmentId: 'medicine_ball', quantity: 1, maxLoadLb: 15 },
  { equipmentId: 'mini_band', quantity: 1 },
  { equipmentId: 'stability_ball', quantity: 1 },
]);

const gym = createGymTrainingSpace([
  { equipmentId: 'dumbbell', quantity: 2, minLoadLb: 5, maxLoadLb: 100 },
  { equipmentId: 'kettlebell', quantity: 1, minLoadLb: 10, maxLoadLb: 80 },
  { equipmentId: 'barbell', quantity: 1, maxLoadLb: 315 },
  { equipmentId: 'weight_plate', quantity: 8, maxLoadLb: 45 },
  { equipmentId: 'trap_bar', quantity: 1, maxLoadLb: 315 },
  { equipmentId: 'cable_machine', quantity: 1 },
  { equipmentId: 'leg_press', quantity: 1 },
  { equipmentId: 'bench', quantity: 1 },
  { equipmentId: 'pullup_bar', quantity: 1 },
]);

const dbStrength = exercise('db-strength', 'dumbbell', 'primary_strength');
const bosuStability = exercise('bosu-stability', 'bosu', 'stability');

describe('training space capabilities', () => {
  it('preserves exact equipment inventories and load ranges', () => {
    expect(equipmentIdsForTrainingSpace(home)).toContain('stability_ball');
    expect(equipmentIdsForTrainingSpace(home)).not.toContain('barbell');
    expect(home.capabilities.find((item) => item.equipmentId === 'dumbbell')).toMatchObject({ minLoadLb: 5, maxLoadLb: 25 });
    expect(home.capabilities.find((item) => item.equipmentId === 'kettlebell')).toMatchObject({ minLoadLb: 25, maxLoadLb: 40 });
  });

  it('recognizes meaningful gym loading capacity for strength movements', () => {
    expect(loadCapacityAdvantage(dbStrength, home, gym)).toBe(12);
  });

  it('does not invent a load advantage for non-strength specialty work', () => {
    expect(loadCapacityAdvantage(bosuStability, home, gym)).toBe(0);
  });

  it('makes heavy dumbbell strength more valuable at the gym than home-specialty work', () => {
    expect(trainingSpaceExerciseScore(dbStrength, gym, home)).toBeGreaterThan(
      trainingSpaceExerciseScore(bosuStability, gym, home),
    );
  });
});
