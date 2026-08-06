import { describe, expect, it } from 'vitest';
import { recommendStrengthDose, validateCapacityProfile } from '../src/capacity';

const base = {
  totalWeeklyHours: 10,
  currentEnduranceHours: 6,
  runStatus: 'normal' as const,
  maxRunMilesLast12Weeks: 20,
  boneStressInjuryHistory: 'none' as const,
  swimProficiency: 'average' as const,
  bikeProficiency: 'average' as const,
  runProficiency: 'average' as const,
  strengthExperience: 'intermediate' as const,
};

describe('V18.13 adaptive dose safeguards', () => {
  it('rejects endurance hours above the total weekly budget', () => {
    expect(validateCapacityProfile({ ...base, totalWeeklyHours: 8, currentEnduranceHours: 9 })).toContain('Current endurance hours cannot exceed total weekly training hours.');
  });

  it('caps total strength minutes and high-load days', () => {
    const result = recommendStrengthDose({ ...base, totalWeeklyHours: 15, currentEnduranceHours: 8 }, 'ironman_70_3', 20);
    expect(result.minutesPerWeek).toBeLessThanOrEqual(result.maximumRecommendedMinutes);
    expect(result.sessionRoles.filter((role) => role === 'heavy').length).toBeLessThanOrEqual(result.maxHighLoadStrengthDays);
    expect(result.maxTotalHardDays).toBe(4);
  });

  it('uses support sessions rather than five hard sessions during return to run', () => {
    const result = recommendStrengthDose({ ...base, totalWeeklyHours: 12, currentEnduranceHours: 5, runStatus: 'return_to_run', boneStressInjuryHistory: 'recent_or_current', maxRunMilesLast12Weeks: 0 }, 'ironman_70_3', 20);
    expect(result.sessionsPerWeek).toBeGreaterThanOrEqual(4);
    expect(result.sessionRoles.filter((role) => role === 'heavy').length).toBeLessThanOrEqual(2);
    expect(result.sessionRoles).toContain('stability');
    expect(result.validationWarnings.some((warning) => warning.includes('No recent run-mileage baseline'))).toBe(true);
  });

  it('reduces the race-proximate dose and preserves a minimum effective range', () => {
    const result = recommendStrengthDose(base, 'ironman_70_3', 3);
    expect(result.sessionsPerWeek).toBe(2);
    expect(result.minutesPerWeek).toBeLessThanOrEqual(result.maximumRecommendedMinutes);
    expect(result.phaseSchedule.race_week).toBe(1);
  });
});
