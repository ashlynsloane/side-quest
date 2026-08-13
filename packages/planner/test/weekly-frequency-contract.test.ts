import { describe, expect, it } from 'vitest';

import {
  applyAthleteDisciplinePriority,
  resolveWeeklyFrequencyContract,
} from '../src/weekly-frequency-contract';

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


describe('athlete discipline priority overlay', () => {
  it('adds one bike when bike is the athlete primary discipline', () => {
    const base = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'normal',
      plannedStrengthSessions: 2,
    });

    const prioritized = applyAthleteDisciplinePriority(
      base,
      'bike',
      'normal',
    );

    expect(prioritized.swim.preferred).toBe(3);
    expect(prioritized.bike).toEqual({
      min: 3,
      preferred: 4,
      max: 4,
    });
    expect(prioritized.run.preferred).toBe(3);
  });

  it('adds one swim when swim is the athlete primary discipline', () => {
    const base = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'normal',
      plannedStrengthSessions: 2,
    });

    const prioritized = applyAthleteDisciplinePriority(
      base,
      'swim',
      'normal',
    );

    expect(prioritized.swim.preferred).toBe(4);
    expect(prioritized.bike.preferred).toBe(3);
    expect(prioritized.run.preferred).toBe(3);
  });

  it('adds one run when run is the athlete primary discipline', () => {
    const base = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'normal',
      plannedStrengthSessions: 2,
    });

    const prioritized = applyAthleteDisciplinePriority(
      base,
      'run',
      'normal',
    );

    expect(prioritized.run.preferred).toBe(4);
    expect(prioritized.run.min).toBe(3);
  });

  it('does not add another run during return-to-run', () => {
    const base = resolveWeeklyFrequencyContract({
      goalType: 'ironman_70_3',
      runStatus: 'return_to_run',
      plannedStrengthSessions: 2,
    });

    const prioritized = applyAthleteDisciplinePriority(
      base,
      'run',
      'return_to_run',
    );

    expect(prioritized.run).toEqual({
      min: 2,
      preferred: 2,
      max: 2,
    });
  });
});
