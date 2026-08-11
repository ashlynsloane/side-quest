import { describe, expect, it } from 'vitest';

import {
  coachStrategyAppliesToWeek,
  coachStrategyWindowStateForWeek,
  strategyReturnToBaselineWeek,
} from '../src/coach-strategy-window';

describe('Strategy Coach window lifecycle', () => {
  const strategy = {
    startsAt: '2026-08-17',
    endsAt: '2026-08-30',
    primaryFocus: 'bike' as const,
    disciplineObjectives: { bike: 'maximize' as const },
  };

  it('classifies scheduled, active, and expired planning weeks', () => {
    expect(coachStrategyWindowStateForWeek(strategy, '2026-08-10')).toBe('scheduled');
    expect(coachStrategyWindowStateForWeek(strategy, '2026-08-17')).toBe('active');
    expect(coachStrategyWindowStateForWeek(strategy, '2026-08-24')).toBe('active');
    expect(coachStrategyWindowStateForWeek(strategy, '2026-08-31')).toBe('expired');
  });

  it('uses the same lifecycle for planner application', () => {
    expect(coachStrategyAppliesToWeek(strategy, '2026-08-10')).toBe(false);
    expect(coachStrategyAppliesToWeek(strategy, '2026-08-17')).toBe(true);
    expect(coachStrategyAppliesToWeek(strategy, '2026-08-31')).toBe(false);
  });

  it('finds the first full week that returns to Race Intent', () => {
    expect(strategyReturnToBaselineWeek(strategy, ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'])).toBe('2026-08-31');
  });
});
