import { afterEach, describe, expect, it } from 'vitest';

import { buildStrategyMacrocycle } from '../src/strategy-macrocycle';
import {
  buildWholeAthleteWeek,
  configureWholeAthleteCoachStrategy,
  configureWholeAthleteStrategyLayers,
} from '../src/whole-athlete-week-strategy';
import type { WholeAthleteWeeklyPlannerInput } from '../src/whole-athlete-week';

const raceIntent = {
  version: 2 as const,
  overallObjective: 'discipline_performance' as const,
  primaryDiscipline: 'swim' as const,
  disciplinePriorities: { swim: 'primary_focus' as const, bike: 'maintain' as const, run: 'maintain' as const },
  tradeoffTolerance: 'moderate_tradeoff' as const,
};

const approvedStrategy = {
  startsAt: '2026-08-17',
  endsAt: '2026-08-30',
  primaryFocus: 'bike' as const,
  disciplineObjectives: { bike: 'maximize' as const, swim: 'maintain' as const, run: 'maintain' as const },
  tradeoffTolerance: 'aggressive_specialization' as const,
};

function input(weekStartDate: string, phase: WholeAthleteWeeklyPlannerInput['phase']): WholeAthleteWeeklyPlannerInput {
  return {
    weekStartDate,
    availableMinutes: 900,
    goalType: 'ironman_70_3',
    phase,
    health: {
      energyAvailability: 'adequate',
      menstrualRecovery: 'stable',
      boneStress: 'none',
      injuryConstraint: 'none',
      mentalEnergy: 'good',
      lifeStress: 'low',
    },
    previousWeek: [],
  };
}

afterEach(() => configureWholeAthleteCoachStrategy(undefined));

describe('Strategy Coach macrocycle', () => {
  it('shows Race Intent before and after a temporary Strategy Coach window', () => {
    configureWholeAthleteStrategyLayers(raceIntent, approvedStrategy);
    const weeks = [
      { phase: 'base' as const, plan: buildWholeAthleteWeek(input('2026-08-10', 'base')) },
      { phase: 'build' as const, plan: buildWholeAthleteWeek(input('2026-08-17', 'build')) },
      { phase: 'build' as const, plan: buildWholeAthleteWeek(input('2026-08-24', 'build')) },
      { phase: 'taper' as const, plan: buildWholeAthleteWeek(input('2026-08-31', 'taper')) },
    ];

    const macro = buildStrategyMacrocycle({
      raceIntent,
      approvedStrategy,
      weeks,
      referenceWeekStart: '2026-08-17',
    });

    expect(macro).not.toBeNull();
    expect(macro?.approvedWindowState).toBe('active');
    expect(macro?.returnToRaceIntentWeek).toBe('2026-08-31');
    expect(macro?.weeks.map((week) => week.source)).toEqual([
      'race_intent',
      'strategy_coach',
      'strategy_coach',
      'race_intent',
    ]);
    expect(macro?.weeks[0]?.expression.topFocus).toBe('swim');
    expect(macro?.weeks[1]?.expression.topFocus).toBe('bike');
    expect(macro?.weeks[3]?.expression.topFocus).toBe('swim');
  });

  it('groups contiguous training phases and exposes the next phase transition', () => {
    configureWholeAthleteStrategyLayers(raceIntent, approvedStrategy);
    const weeks = [
      { phase: 'base' as const, plan: buildWholeAthleteWeek(input('2026-08-10', 'base')) },
      { phase: 'build' as const, plan: buildWholeAthleteWeek(input('2026-08-17', 'build')) },
      { phase: 'build' as const, plan: buildWholeAthleteWeek(input('2026-08-24', 'build')) },
      { phase: 'taper' as const, plan: buildWholeAthleteWeek(input('2026-08-31', 'taper')) },
    ];
    const macro = buildStrategyMacrocycle({ raceIntent, approvedStrategy, weeks, referenceWeekStart: '2026-08-17' });

    expect(macro?.phases.map((phase) => [phase.phase, phase.weeks])).toEqual([
      ['base', 1],
      ['build', 2],
      ['taper', 1],
    ]);
    expect(macro?.nextPhaseTransition).toEqual({ from: 'build', to: 'taper', startsAt: '2026-08-31' });
  });

  it('marks an open-ended approved strategy as continuing beyond the generated block', () => {
    const openEnded = { ...approvedStrategy, endsAt: undefined };
    configureWholeAthleteStrategyLayers(raceIntent, openEnded);
    const weeks = [
      { phase: 'build' as const, plan: buildWholeAthleteWeek(input('2026-08-17', 'build')) },
      { phase: 'build' as const, plan: buildWholeAthleteWeek(input('2026-08-24', 'build')) },
    ];
    const macro = buildStrategyMacrocycle({ raceIntent, approvedStrategy: openEnded, weeks, referenceWeekStart: '2026-08-17' });
    expect(macro?.strategyContinuesBeyondBlock).toBe(true);
    expect(macro?.returnToRaceIntentWeek).toBeUndefined();
  });
});
