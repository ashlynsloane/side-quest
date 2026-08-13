import { describe, expect, it } from 'vitest';

import { resolveWeeklyFrequencyContract } from '../src/weekly-frequency-contract';

describe('weekly frequency contract', () => {
  it('keeps a normal 70.3 week from ballooning beyond its preferred bike frequency', () => {
    const contract = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'normal',
      plannedStrengthSessions: 3,
    });

    expect(contract.swim).toEqual({ min: 3, preferred: 3, max: 3 });
    expect(contract.bike).toEqual({ min: 4, preferred: 4, max: 4 });
    expect(contract.run).toEqual({ min: 3, preferred: 3, max: 3 });
    expect(contract.strength).toEqual({ min: 3, preferred: 3, max: 3 });
  });

  it('locks return-to-run to two generated exposures while preserving explicit commitments', () => {
    const normal = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'return_to_run',
      plannedStrengthSessions: 3,
    });
    expect(normal.run).toEqual({ min: 2, preferred: 2, max: 2 });

    const athleteCommitted = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'return_to_run',
      fixedCounts: { run: 3 },
      plannedStrengthSessions: 3,
    });
    expect(athleteCommitted.run).toEqual({
      min: 3,
      preferred: 3,
      max: 3,
    });
  });

  it('uses the actual planned strength count instead of inventing another frequency', () => {
    const contract = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'return_to_run',
      plannedStrengthSessions: 3,
    });

    expect(contract.strength).toEqual({
      min: 3,
      preferred: 3,
      max: 3,
    });
  });

  it('preserves fixed athlete commitments even when they exceed the normal goal default', () => {
    const contract = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'normal',
      fixedCounts: {
        swim: 3,
        bike: 4,
      },
      plannedStrengthSessions: 3,
    });

    expect(contract.swim.preferred).toBe(3);
    expect(contract.swim.max).toBe(3);
    expect(contract.bike.preferred).toBe(4);
    expect(contract.bike.max).toBe(4);
  });

  it('does not generate running when the athlete is not running', () => {
    const contract = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'not_running',
      plannedStrengthSessions: 3,
    });

    expect(contract.run).toEqual({ min: 0, preferred: 0, max: 0 });
  });
});
