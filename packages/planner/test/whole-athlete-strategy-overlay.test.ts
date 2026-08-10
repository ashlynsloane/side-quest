import { afterEach, describe, expect, it } from 'vitest';

import {
  buildWholeAthleteWeek as buildBaseWholeAthleteWeek,
  type WholeAthleteWeeklyPlannerInput,
} from '../src/whole-athlete-week';
import {
  buildWholeAthleteWeek,
  configureWholeAthleteCoachStrategy,
  configureWholeAthleteStrategyLayers,
} from '../src/whole-athlete-week-strategy';

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

describe('whole-athlete strategy overlay', () => {
  it('is behaviorally inert when no approved strategy is configured', () => {
    const request = input();
    expect(buildWholeAthleteWeek(request)).toEqual(buildBaseWholeAthleteWeek(request));
  });

  it('gives an approved bike focus more discretionary frequency without lowering race minimums', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });
    const plan = buildWholeAthleteWeek(input());
    const bike = plan.disciplineSummary.find((item) => item.discipline === 'bike');
    const swim = plan.disciplineSummary.find((item) => item.discipline === 'swim');
    const run = plan.disciplineSummary.find((item) => item.discipline === 'run');

    expect(bike?.targetPreferred).toBe(4);
    expect(swim?.targetMin).toBe(2);
    expect(run?.targetMin).toBe(2);
    expect(plan.progressionBudget.primary).toBe('bike_volume');
  });

  it('can redirect scarce build progression to swim while keeping the triathlon frequency floor', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'swim',
      disciplineObjectives: { swim: 'primary_focus', bike: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });
    const plan = buildWholeAthleteWeek(input());
    expect(plan.progressionBudget.primary).toBe('swim_volume');
    expect(plan.disciplineSummary.find((item) => item.discipline === 'swim')?.targetPreferred).toBe(4);
    expect(plan.disciplineSummary.find((item) => item.discipline === 'bike')?.targetMin).toBe(2);
    expect(plan.disciplineSummary.find((item) => item.discipline === 'run')?.targetMin).toBe(2);
  });

  it('can redirect scarce build progression to run while retaining swim and bike minimums', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'run',
      disciplineObjectives: { run: 'develop', bike: 'maintain', swim: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });
    const plan = buildWholeAthleteWeek(input());
    expect(plan.progressionBudget.primary).toBe('run_volume');
    expect(plan.disciplineSummary.find((item) => item.discipline === 'swim')?.targetMin).toBe(2);
    expect(plan.disciplineSummary.find((item) => item.discipline === 'bike')?.targetMin).toBe(2);
  });

  it('protects return-to-run impact while allowing a bike-focused 70.3 week to use non-impact capacity', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });
    const request = input({
      availableMinutes: 840,
      returnToRun: true,
      recentBoneStress: true,
      health: {
        energyAvailability: 'adequate',
        menstrualRecovery: 'stable',
        boneStress: 'recent',
        injuryConstraint: 'monitor',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });
    const adjusted = buildWholeAthleteWeek(request);
    const bike = adjusted.sessions.filter((session) => session.discipline === 'bike');
    const swim = adjusted.sessions.filter((session) => session.discipline === 'swim');
    const run = adjusted.sessions.filter((session) => session.discipline === 'run');
    const bikeMinutes = bike.reduce((sum, session) => sum + session.durationMinutes, 0);
    const swimMinutes = swim.reduce((sum, session) => sum + session.durationMinutes, 0);

    expect(adjusted.planningState).toBe('build');
    expect(adjusted.progressionBudget.primary).toBe('bike_volume');
    expect(bike.length).toBeGreaterThanOrEqual(4);
    expect(bikeMinutes).toBeGreaterThanOrEqual(420);
    expect(swim.length).toBeGreaterThanOrEqual(3);
    expect(swimMinutes).toBeGreaterThanOrEqual(120);
    expect(run.length).toBeLessThanOrEqual(2);
    expect(run.every((session) => session.intensity === 'easy' && session.durationMinutes <= 30)).toBe(true);
    expect(adjusted.plannedMinutes).toBeLessThanOrEqual(840);
    expect(adjusted.guardrails.join(' ')).toContain('discipline-local');
  });

  it('still blocks specialization when return-to-run coexists with a broader recovery constraint', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'maximize' },
      tradeoffTolerance: 'aggressive_specialization',
    });
    const request = input({
      returnToRun: true,
      recentBoneStress: true,
      health: {
        energyAvailability: 'concerning',
        menstrualRecovery: 'stable',
        boneStress: 'recent',
        injuryConstraint: 'monitor',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });
    const baseline = buildBaseWholeAthleteWeek(request);
    const adjusted = buildWholeAthleteWeek(request);
    expect(adjusted.sessions).toEqual(baseline.sessions);
    expect(adjusted.progressionBudget).toEqual(baseline.progressionBudget);
    expect(adjusted.planningState).toBe('protect');
  });

  it('remembers strategy during taper without reallocating the taper week', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'swim',
      disciplineObjectives: { swim: 'maximize', bike: 'minimum_viable', run: 'minimum_viable' },
      tradeoffTolerance: 'aggressive_specialization',
    });
    const request = input({ phase: 'taper' });
    const baseline = buildBaseWholeAthleteWeek(request);
    const adjusted = buildWholeAthleteWeek(request);
    expect(adjusted.sessions).toEqual(baseline.sessions);
    expect(adjusted.progressionBudget).toEqual(baseline.progressionBudget);
    expect(adjusted.warnings.join(' ')).toContain('taper');
  });

  it('does not activate a future strategy before its start window', () => {
    configureWholeAthleteCoachStrategy({
      startsAt: '2026-09-01',
      disciplineObjectives: { bike: 'maximize' },
      primaryFocus: 'bike',
    });
    const request = input();
    expect(buildWholeAthleteWeek(request)).toEqual(buildBaseWholeAthleteWeek(request));
  });

  it('uses Race Intent before and after a temporary Strategy Coach override', () => {
    configureWholeAthleteStrategyLayers({
      version: 2,
      overallObjective: 'discipline_performance',
      primaryDiscipline: 'swim',
      disciplinePriorities: { swim: 'primary_focus', bike: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    }, {
      startsAt: '2026-08-17',
      endsAt: '2026-08-30',
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'maximize', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'aggressive_specialization',
    });

    const before = buildWholeAthleteWeek(input({ weekStartDate: '2026-08-10' }));
    const during = buildWholeAthleteWeek(input({ weekStartDate: '2026-08-17' }));
    const after = buildWholeAthleteWeek(input({ weekStartDate: '2026-08-31' }));

    expect(before.progressionBudget.primary).toBe('swim_volume');
    expect(during.progressionBudget.primary).toBe('bike_volume');
    expect(after.progressionBudget.primary).toBe('swim_volume');
  });
});
