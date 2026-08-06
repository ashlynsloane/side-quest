import { describe, expect, it } from 'vitest';
import { recommendStrengthDose } from '../src/capacity';

const base = { totalWeeklyHours: 10, currentEnduranceHours: 6, runStatus: 'normal' as const, maxRunMilesLast12Weeks: 20, boneStressInjuryHistory: 'none' as const, swimProficiency: 'average' as const, bikeProficiency: 'average' as const, runProficiency: 'average' as const, strengthExperience: 'intermediate' as const };

describe('adaptive strength dose', () => {
  it('reduces strength near race day', () => {
    const result = recommendStrengthDose(base, 'ironman_70_3', 3);
    expect(result.sessionsPerWeek).toBe(2);
    expect(result.phaseSchedule.race_week).toBe(1);
  });
  it('supports an early strength emphasis during return to run', () => {
    const result = recommendStrengthDose({ ...base, totalWeeklyHours: 12, currentEnduranceHours: 5, runStatus: 'return_to_run', boneStressInjuryHistory: 'recent_or_current' }, 'ironman_70_3', 20);
    expect(result.sessionsPerWeek).toBeGreaterThanOrEqual(4);
    expect(result.phaseSchedule.base).toBeGreaterThanOrEqual(4);
    expect(result.phaseSchedule.taper).toBe(2);
  });
});
