import { describe, expect, it } from 'vitest';

import { resolveWeeklyFrequencyContract } from '../src/weekly-frequency-contract';

describe('weekly frequency contract', () => {
  it('uses the normal 70.3 minimum floor', () => {
    const contract = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'normal',
      plannedStrengthSessions: 2,
    });

    expect(contract.swim).toEqual({
      min: 3,
      preferred: 3,
      max: 3,
    });

    expect(contract.bike).toEqual({
      min: 3,
      preferred: 3,
      max: 3,
    });

    expect(contract.run).toEqual({
      min: 3,
      preferred: 3,
      max: 3,
    });

    expect(contract.strength).toEqual({
      min: 2,
      preferred: 2,
      max: 2,
    });
  });

  it('locks return-to-run to two exposures', () => {
    const contract = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'return_to_run',
      plannedStrengthSessions: 3,
    });

    expect(contract.run).toEqual({
      min: 2,
      preferred: 2,
      max: 2,
    });
  });

  it('preserves explicit return-to-run commitments above the generated floor', () => {
    const contract = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'return_to_run',
      fixedCounts: { run: 3 },
      plannedStrengthSessions: 3,
    });

    expect(contract.run).toEqual({
      min: 3,
      preferred: 3,
      max: 3,
    });
  });

  it('preserves explicit athlete commitments above the normal floor', () => {
    const contract = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'normal',
      fixedCounts: {
        swim: 4,
        bike: 4,
        strength: 3,
      },
      plannedStrengthSessions: 3,
    });

    expect(contract.swim).toEqual({
      min: 4,
      preferred: 4,
      max: 4,
    });

    expect(contract.bike).toEqual({
      min: 4,
      preferred: 4,
      max: 4,
    });

    expect(contract.strength).toEqual({
      min: 3,
      preferred: 3,
      max: 3,
    });
  });

  it('does not generate running when the athlete is not running', () => {
    const contract = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'not_running',
      plannedStrengthSessions: 3,
    });

    expect(contract.run).toEqual({
      min: 0,
      preferred: 0,
      max: 0,
    });
  });
});
