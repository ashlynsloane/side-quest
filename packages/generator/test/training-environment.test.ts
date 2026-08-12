import { describe, expect, it } from 'vitest';
import type { Exercise } from '@circuit/domain';
import {
  classifyExerciseEnvironmentValue,
  gymOpportunityShare,
  trainingEnvironmentScore,
} from '../src/training-environment';

function exercise(id: string, equipment: Exercise['equipmentOptions']): Exercise {
  return {
    id,
    slug: id,
    name: id,
    aliases: [],
    status: 'active',
    classification: equipment.some((option) => option.items.some((item) => item.equipmentId !== 'bodyweight')) ? 'equipment' : 'bodyweight',
    category: 'test',
    shortDescription: 'test',
    instructions: { setup: [], execution: [], cues: [], commonMistakes: [] },
    bodyRegions: [],
    jointLoads: [],
    movementPatterns: ['squat'],
    avoidanceTags: [],
    laterality: 'bilateral',
    stationRoles: ['primary_strength'],
    equipmentOptions: equipment,
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

const homeEquipment = ['dumbbell', 'kettlebell', 'bench', 'bosu', 'slider', 'medicine_ball', 'mini_band', 'stability_ball'] as const;

const dbSquat = exercise('db-squat', [{ id: 'db', label: 'DB', items: [{ equipmentId: 'dumbbell', quantity: 2 }] }]);
const legPress = exercise('leg-press', [{ id: 'machine', label: 'Machine', items: [{ equipmentId: 'leg_press', quantity: 1 }] }]);
const bosuSquat = exercise('bosu-squat', [{ id: 'bosu', label: 'BOSU', items: [{ equipmentId: 'bosu', quantity: 1 }] }]);
const cableOrDbRow = exercise('cable-or-db-row', [
  { id: 'cable', label: 'Cable', items: [{ equipmentId: 'cable_machine', quantity: 1 }] },
  { id: 'db', label: 'DB', items: [{ equipmentId: 'dumbbell', quantity: 1 }] },
]);

describe('training environment intelligence', () => {
  it('recognizes movements that are uniquely valuable at the gym', () => {
    expect(classifyExerciseEnvironmentValue(legPress, { homeEquipment: [...homeEquipment] })).toBe('gym_dependent');
    expect(classifyExerciseEnvironmentValue(cableOrDbRow, { homeEquipment: [...homeEquipment] })).toBe('gym_advantaged');
  });

  it('recognizes home-specialty and home-equivalent movements', () => {
    expect(classifyExerciseEnvironmentValue(bosuSquat, { homeEquipment: [...homeEquipment] })).toBe('home_specialty');
    expect(classifyExerciseEnvironmentValue(dbSquat, { homeEquipment: [...homeEquipment] })).toBe('home_equivalent');
  });

  it('rewards gym opportunity cost instead of merely gym eligibility', () => {
    const profile = {
      environment: 'gym' as const,
      availableEquipment: [...homeEquipment, 'cable_machine', 'leg_press'] as const,
      homeEquipment: [...homeEquipment],
    };
    expect(trainingEnvironmentScore(legPress, { ...profile, availableEquipment: [...profile.availableEquipment] })).toBeGreaterThan(
      trainingEnvironmentScore(dbSquat, { ...profile, availableEquipment: [...profile.availableEquipment] }),
    );
  });

  it('can audit whether a gym session is actually exploiting the gym', () => {
    expect(gymOpportunityShare([legPress, cableOrDbRow, dbSquat, bosuSquat], { homeEquipment: [...homeEquipment] })).toBe(0.5);
  });
});
