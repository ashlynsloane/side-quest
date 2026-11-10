import { describe, expect, it } from 'vitest';
import type { GeneratedWorkout, Exercise, BodyRegion, JointRegion } from '@circuit/domain';
import { affectedTrainingRegions } from '../src/training-region-inference';

function workout(regions: BodyRegion[], exercise?: Partial<Exercise>): GeneratedWorkout {
  const snapshot = {
    bodyRegions: [], jointLoads: [], movementPatterns: [], ...exercise,
  } as Exercise;
  return {
    id: 'test', name: 'Training', createdAt: '2026-11-09',
    randomSeed: 'test', request: {} as GeneratedWorkout['request'],
    stations: [{ id: 'station', order: 1, durationSeconds: 60,
      format: 'amrap', purpose: 'test', exercises: [{
        exerciseId: 'exercise', exerciseSnapshot: snapshot,
        equipmentOptionId: 'none', prescriptionId: 'none', target: 8,
        unit: 'total', order: 1,
      }],
    }], totalWorkSeconds: 60, totalRestSeconds: 0,
    estimatedElapsedSeconds: 60, requiredEquipment: [],
    targetRegions: regions, recentLoadAdjustments: [], source: 'generated',
  };
}

describe('affected training regions', () => {
  it('recognizes soleus and gastrocnemius without textual name heuristics', () => {
    for (const region of ['soleus', 'gastrocnemius', 'feet_ankles'] as BodyRegion[]) {
      expect(affectedTrainingRegions(workout([region]))).toContain('achilles');
    }
  });
  it('recognizes ankle joint loading even when target is core', () => {
    const w = workout(['core_anterior'], {
      jointLoads: [{ region: 'ankle' as JointRegion, load: 2 }],
    });
    expect(affectedTrainingRegions(w)).toContain('achilles');
  });
  it('recognizes exercise-level thoracic loading', () => {
    const w = workout(['core_anterior'], {
      bodyRegions: [{ region: 'upper_back', role: 'stabilizer', load: 1 }],
    });
    expect(affectedTrainingRegions(w)).toContain('upper_back');
  });
  it('recognizes lunges even when the workout target is incomplete', () => {
    expect(affectedTrainingRegions(workout(['core_anterior'], {
      movementPatterns: ['lunge'],
    }))).toContain('achilles');
  });
  it('does not automatically label pure core-anterior work as Achilles loading', () => {
    expect(affectedTrainingRegions(workout(['core_anterior']))).toEqual(['general']);
  });
  it('fails conservatively when exercise data are missing', () => {
    expect(affectedTrainingRegions(workout([], { jointLoads: undefined }))).toEqual([
      'general', 'achilles', 'upper_back',
    ]);
  });
});
