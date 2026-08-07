import { describe, expect, it } from 'vitest';
import type { PerformanceGoal, PlannedStrengthSession } from '@circuit/domain';
import { explainPlannedStrengthSession } from '../src/recommendation-explanation';


function goal(): PerformanceGoal {
  return {
    id: 'goal-1', type: 'ironman_70_3' as const, name: 'Ironman 70.3', weeksUntilEvent: 16,
    disciplines: ['swim', 'bike', 'run'], priority: 'perform' as const, sessionsPerWeek: 3 as const,
    defaultSessionMinutes: 32 as const, createdAt: '2026-08-06T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z',
    capacityProfile: {
      totalWeeklyHours: 12, currentEnduranceHours: 9, runStatus: 'return_to_run' as const, maxRunMilesLast12Weeks: 0,
      boneStressInjuryHistory: 'remote' as const, swimProficiency: 'average' as const, bikeProficiency: 'strong' as const,
      runProficiency: 'developing' as const, strengthExperience: 'intermediate' as const,
    },
  };
}

function session(): PlannedStrengthSession {
  return {
    id: 'session-1', date: '2026-08-10', order: 1, title: 'Run durability', purpose: 'single_leg_durability',
    intendedLoad: 'moderate', focusTargets: [], rationale: 'Build lower-body durability without adding impact.',
    placementNote: 'Placed between key endurance days.', completionStatus: 'planned',
    workout: {
      id: 'workout-1', name: 'Run durability', createdAt: '2026-08-06T00:00:00.000Z', randomSeed: 'seed',
      request: {
        workMinutes: 32, allowedStationMinutes: [8], restSeconds: 60, exercisesPerStation: 2,
        focusTargets: [], excludedRegions: [], excludedMovementTags: [], availableEquipment: ['bodyweight'],
        difficulty: 'intermediate', workoutStyle: 'strength_cardio_amrap', maximumImpact: 1, recoveryAware: true, avoidPreviousWorkoutExercises: false, favorFamiliarExercises: true, allowUnfamiliarExercises: true, minimizeEquipmentChanges: true,

      },
      stations: [], totalWorkSeconds: 1920, totalRestSeconds: 180, estimatedElapsedSeconds: 2100,
      requiredEquipment: ['bodyweight'], targetRegions: ['glutes', 'hamstrings', 'soleus'], recentLoadAdjustments: [], source: 'generated',
    },
  };
}

describe('explainPlannedStrengthSession', () => {
  it('creates athlete-specific reasons, adaptations, fatigue, confidence, and safeguards', () => {
    const result = explainPlannedStrengthSession(session(), { goal: goal(), previousSessionDate: '2026-08-07' });
    expect(result.conciseWhy.some((item) => item.includes('conservatively'))).toBe(true);
    expect(result.expectedAdaptations).toContain('run_durability');
    expect(result.fatigue.recoveryHours).toBeGreaterThanOrEqual(18);
    expect(result.confidence.label).toBe('moderate');
    expect(result.confidence.missingInputs.length).toBeGreaterThan(0);
    expect(result.whyNotHarder).toContain('harder session');
    expect(result.safeguards).toHaveLength(4);
  });

  it('raises confidence when history, integration, and readiness are available', () => {
    const result = explainPlannedStrengthSession(session(), {
      goal: goal(), hasTrainingHistory: true, hasConnectedTrainingData: true, hasReadinessData: true,
    });
    expect(result.confidence.label).toBe('high');
    expect(result.confidence.missingInputs).toEqual([]);
  });
});
