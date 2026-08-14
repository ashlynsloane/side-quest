import { describe, expect, it } from 'vitest';

import type { Exercise } from '@circuit/domain';
import {
  classifyExerciseEnvironmentValue,
  trainingEnvironmentScore,
} from '../src/training-environment';

function machineExercise(equipmentId: Exercise['equipmentOptions'][number]['items'][number]['equipmentId']): Exercise {
  return {
    id: `test_${equipmentId}`,
    slug: `test-${equipmentId}`,
    name: `Test ${equipmentId}`,
    aliases: [],
    status: 'active',
    classification: 'equipment',
    category: 'Test',
    shortDescription: 'Test machine movement.',
    instructions: {
      setup: [],
      execution: [],
      cues: [],
      commonMistakes: [],
    },
    bodyRegions: [{ region: 'quadriceps', role: 'primary', load: 3 }],
    jointLoads: [],
    movementPatterns: ['squat'],
    avoidanceTags: [],
    laterality: 'bilateral',
    stationRoles: ['primary_strength'],
    equipmentOptions: [{
      id: 'machine',
      label: 'Machine',
      items: [{ equipmentId, quantity: 1 }],
    }],
    prescriptions: [{
      id: 'default',
      style: 'amrap',
      mode: 'reps',
      target: 10,
      unit: 'total',
      estimatedSeconds: 30,
      loadGuidance: 'Controlled load.',
    }],
    impactLevel: 0,
    balanceDemand: 1,
    cardiovascularDemand: 1,
    technicalComplexity: 1,
    suitableForAmrap: true,
    suitableForTravel: false,
    suitableForBeginners: true,
    substitutionGroupIds: [],
    compatibility: {
      preferredPairingPatterns: [],
      avoidPairingPatterns: [],
      maximumAppearancesPerWorkout: 1,
    },
    media: [],
    defaultEnabled: true,
    contentVersion: 1,
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  } as Exercise;
}

describe('commercial gym equipment classification', () => {
  const machineIds = [
    'hack_squat_machine',
    'leg_extension_machine',
    'leg_curl_machine',
    'calf_raise_machine',
    'assisted_pullup_machine',
    'chest_press_machine',
    'row_machine',
  ] as const;

  for (const equipmentId of machineIds) {
    it(`${equipmentId} is gym-dependent when unavailable at home`, () => {
      const exercise = machineExercise(equipmentId);

      expect(
        classifyExerciseEnvironmentValue(exercise, {
          homeEquipment: ['dumbbell', 'mini_band', 'slider'],
        }),
      ).toBe('gym_dependent');

      expect(
        trainingEnvironmentScore(exercise, {
          environment: 'gym',
          availableEquipment: [equipmentId],
          homeEquipment: ['dumbbell', 'mini_band', 'slider'],
        }),
      ).toBeGreaterThan(0);
    });
  }
});
