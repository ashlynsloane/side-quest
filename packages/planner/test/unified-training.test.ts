import { describe, expect, it } from 'vitest';
import {
  chooseProgressionBudget,
  requiresAthleteApproval,
  validateUnifiedWeek,
  type UnifiedTrainingSession,
} from '../src/unified-training';

function session(overrides: Partial<UnifiedTrainingSession>): UnifiedTrainingSession {
  return {
    id: 's1', date: '2026-08-03', title: 'Session', discipline: 'strength', durationMinutes: 40,
    intensity: 'moderate', cardiovascularDemand: 'low', musculoskeletalDemand: 'moderate',
    lowerBodyDemand: 'moderate', upperBodyDemand: 'low', impact: 'low', technicalDemand: 'moderate',
    recoveryCost: 2, priority: 'recommended', source: 'side_quest', keySession: false, ...overrides,
  };
}

const base = { availableMinutes: 600, phase: 'base' as const, goalType: 'ironman_70_3' as const, recentBoneStress: false, returnToRun: false };

describe('unified training core', () => {
  it('blocks plans that exceed time while retaining optional work', () => {
    const report = validateUnifiedWeek([
      session({ id: 'required', durationMinutes: 500, priority: 'required' }),
      session({ id: 'optional', durationMinutes: 180, priority: 'optional' }),
    ], base);
    expect(report.status).toBe('invalid');
    expect(report.violations.map((item) => item.code)).toContain('TIME_BUDGET_EXCEEDED');
    expect(report.violations.map((item) => item.code)).toContain('OPTIONAL_BEFORE_REQUIRED');
  });

  it('protects return-to-run athletes from adjacent impact and heavy lower-body load', () => {
    const report = validateUnifiedWeek([
      session({ id: 'run', date: '2026-08-03', discipline: 'run', impact: 'high', lowerBodyDemand: 'high', intensity: 'hard', recoveryCost: 4 }),
      session({ id: 'lift', date: '2026-08-04', lowerBodyDemand: 'high', intensity: 'hard', recoveryCost: 4 }),
    ], { ...base, returnToRun: true, recentBoneStress: true });
    expect(report.violations.some((item) => item.code === 'RETURN_TO_RUN_IMPACT')).toBe(true);
  });

  it('preserves minimum strength instead of allowing endurance to erase it', () => {
    const report = validateUnifiedWeek([
      session({ id: 'ride', discipline: 'bike', durationMinutes: 180 }),
      session({ id: 'swim', discipline: 'swim', durationMinutes: 60 }),
    ], base);
    expect(report.violations.some((item) => item.code === 'ZERO_STRENGTH_DRIFT')).toBe(true);
  });

  it('uses one primary progression target during protected return-to-run', () => {
    const budget = chooseProgressionBudget({ ...base, returnToRun: true, recentBoneStress: true });
    expect(budget.primary).toBe('run_volume');
    expect(budget.heldStable).toContain('strength_volume');
    expect(budget.reduced).toContain('impact');
  });

  it('requires approval for structural changes but not small same-day reductions', () => {
    expect(requiresAthleteApproval({ durationDeltaMinutes: -10 })).toBe(false);
    expect(requiresAthleteApproval({ changesWeeklyAllocation: true })).toBe(true);
    expect(requiresAthleteApproval({ removesKeySession: true })).toBe(true);
  });
});
