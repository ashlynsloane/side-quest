import { afterEach, describe, expect, it } from 'vitest';

import { buildWeeklyStrategyExpression } from '../src/weekly-strategy-expression';
import { buildWholeAthleteWeek as buildBaseWholeAthleteWeek, type WholeAthleteWeeklyPlannerInput } from '../src/whole-athlete-week';
import { buildWholeAthleteWeek, configureWholeAthleteCoachStrategy } from '../src/whole-athlete-week-strategy';

function input(overrides: Partial<WholeAthleteWeeklyPlannerInput> = {}): WholeAthleteWeeklyPlannerInput {
  return {
    weekStartDate: '2026-08-10',
    availableMinutes: 900,
    goalType: 'ironman_70_3',
    phase: 'build',
    health: {
      energyAvailability: 'adequate',
      menstrualRecovery: 'stable',
      boneStress: 'none',
      injuryConstraint: 'none',
      mentalEnergy: 'good',
      lifeStress: 'low',
    },
    previousWeek: [],
    ...overrides,
  };
}

afterEach(() => configureWholeAthleteCoachStrategy(undefined));

describe('weekly strategy expression', () => {
  it('reports a top focus as expressed only when it actually receives the primary progression slot', () => {
    const strategy = {
      primaryFocus: 'bike' as const,
      disciplineObjectives: { bike: 'maximize' as const, swim: 'maintain' as const, run: 'maintain' as const },
      tradeoffTolerance: 'aggressive_specialization' as const,
      racePriority: { discipline: 'bike' as const, objective: 'personal_best' as const },
    };
    configureWholeAthleteCoachStrategy(strategy);
    const week = buildWholeAthleteWeek(input());
    const expression = buildWeeklyStrategyExpression(week, strategy);

    expect(expression.state).toBe('expressed');
    expect(expression.primaryProgression).toBe('bike');
    expect(expression.headline).toContain('Bike');
    expect(expression.targetSupport?.support).toBe('direct');
    expect(expression.disciplines.find((item) => item.discipline === 'bike')?.role).toBe('top_focus');
  });

  it('calls the strategy only partially expressed when another discipline owns the primary slot', () => {
    const strategy = {
      primaryFocus: 'run' as const,
      disciplineObjectives: { run: 'primary_focus' as const, swim: 'maintain' as const, bike: 'maintain' as const },
    };
    const week = buildBaseWholeAthleteWeek(input());
    const expression = buildWeeklyStrategyExpression(week, strategy);

    expect(expression.state).toBe(week.progressionBudget.primary === 'run_volume' ? 'expressed' : 'partially_expressed');
    if (expression.state === 'partially_expressed') expect(expression.summary).toContain('another');
  });

  it('reports strategy as held when protection prevents discretionary progression', () => {
    const strategy = {
      primaryFocus: 'bike' as const,
      disciplineObjectives: { bike: 'maximize' as const, swim: 'maintain' as const, run: 'minimum_viable' as const },
      racePriority: { discipline: 'bike' as const, objective: 'time_goal' as const, target: '2:35:00' },
    };
    configureWholeAthleteCoachStrategy(strategy);
    const week = buildWholeAthleteWeek(input({
      recentBoneStress: true,
      returnToRun: true,
      health: {
        energyAvailability: 'adequate',
        menstrualRecovery: 'stable',
        boneStress: 'recent',
        injuryConstraint: 'monitor',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    }));
    const expression = buildWeeklyStrategyExpression(week, strategy);

    expect(week.planningState).toBe('protect');
    expect(expression.state).toBe('held');
    expect(expression.targetSupport?.support).toBe('held');
    expect(expression.reasons.join(' ')).toContain('training-stress ceiling');
  });

  it('keeps race-floor disciplines visible rather than treating focus as permission to erase them', () => {
    const strategy = {
      primaryFocus: 'bike' as const,
      disciplineObjectives: { bike: 'maximize' as const, swim: 'minimum_viable' as const, run: 'minimum_viable' as const },
      tradeoffTolerance: 'aggressive_specialization' as const,
    };
    configureWholeAthleteCoachStrategy(strategy);
    const expression = buildWeeklyStrategyExpression(buildWholeAthleteWeek(input()), strategy);
    const swim = expression.disciplines.find((item) => item.discipline === 'swim');
    const run = expression.disciplines.find((item) => item.discipline === 'run');

    expect(swim?.role).toBe('race_floor');
    expect(run?.role).toBe('race_floor');
    expect(swim?.targetMin).toBeGreaterThan(0);
    expect(run?.targetMin).toBeGreaterThan(0);
  });

  it('describes a strategy without a singular top focus as balanced', () => {
    const strategy = {
      disciplineObjectives: { swim: 'develop' as const, bike: 'develop' as const, run: 'develop' as const },
      tradeoffTolerance: 'preserve_balance' as const,
    };
    const expression = buildWeeklyStrategyExpression(buildBaseWholeAthleteWeek(input()), strategy);
    expect(expression.state).toBe('balanced');
    expect(expression.topFocus).toBeUndefined();
  });
});
