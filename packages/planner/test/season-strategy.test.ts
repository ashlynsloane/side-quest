import { describe, expect, it } from 'vitest';

import type { CoachSemanticStrategyChange } from '../src/coach-semantic-frame';
import {
  activeSeasonStrategyForWeek,
  resolveSeasonStrategyForWeek,
  strategyWindowsSharePlanningWeek,
  upsertSeasonStrategyEntry,
  validateSeasonStrategySchedule,
  type SeasonStrategyEntry,
} from '../src/season-strategy';

function strategy(
  focus: 'swim' | 'bike' | 'run',
  startsAt?: string,
  endsAt?: string,
): CoachSemanticStrategyChange {
  return {
    startsAt,
    endsAt,
    primaryFocus: focus,
    disciplineObjectives: { [focus]: 'primary_focus' },
    tradeoffTolerance: 'moderate_tradeoff',
  };
}

function entry(id: string, value: CoachSemanticStrategyChange): SeasonStrategyEntry {
  return { id, strategy: value };
}

describe('season strategy schedule', () => {
  it('allows sequential focus blocks separated by Race Intent weeks', () => {
    const schedule = [
      entry('bike-block', strategy('bike', '2026-08-10', '2026-09-06')),
      entry('run-block', strategy('run', '2026-09-21', '2026-10-18')),
    ];
    expect(validateSeasonStrategySchedule(schedule)).toEqual({ valid: true, errors: [] });
    expect(activeSeasonStrategyForWeek(schedule, '2026-08-24')?.id).toBe('bike-block');
    expect(activeSeasonStrategyForWeek(schedule, '2026-09-14')).toBeUndefined();
    expect(activeSeasonStrategyForWeek(schedule, '2026-09-28')?.id).toBe('run-block');
  });

  it('rejects windows that would both control the same planning week', () => {
    const bike = strategy('bike', '2026-08-10', '2026-09-02');
    const run = strategy('run', '2026-09-03', '2026-10-04');
    expect(strategyWindowsSharePlanningWeek(bike, run)).toBe(true);
    const result = validateSeasonStrategySchedule([entry('bike', bike), entry('run', run)]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('overlap the same planning week');
  });

  it('requires an open-ended strategy to be the final season block', () => {
    const result = validateSeasonStrategySchedule([
      entry('bike-open', strategy('bike', '2026-08-10')),
      entry('run-later', strategy('run', '2026-10-05', '2026-11-01')),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('must be the final season strategy window');
  });

  it('returns the next scheduled window when Race Intent controls the current week', () => {
    const schedule = [
      entry('bike', strategy('bike', '2026-09-07', '2026-10-04')),
      entry('run', strategy('run', '2026-10-19', '2026-11-15')),
    ];
    const result = resolveSeasonStrategyForWeek(schedule, '2026-08-10');
    expect(result.state).toBe('scheduled');
    expect(result.entry?.id).toBe('bike');
  });

  it('can revise one window without replacing the rest of the season schedule', () => {
    const initial = [
      entry('bike', strategy('bike', '2026-08-10', '2026-09-06')),
      entry('run', strategy('run', '2026-09-21', '2026-10-18')),
    ];
    const revised = upsertSeasonStrategyEntry(initial, {
      id: 'run',
      strategy: {
        ...strategy('run', '2026-09-21', '2026-10-18'),
        disciplineObjectives: { run: 'maximize', swim: 'maintain', bike: 'maintain' },
      },
    });
    expect(revised).toHaveLength(2);
    expect(revised.find((item) => item.id === 'bike')?.strategy.primaryFocus).toBe('bike');
    expect(revised.find((item) => item.id === 'run')?.strategy.disciplineObjectives.run).toBe('maximize');
  });
});
