import { afterEach, describe, expect, it } from 'vitest';

import {
  buildWholeAthleteWeek as buildBaseWholeAthleteWeek,
  type WholeAthleteWeeklyPlannerInput,
} from '../src/whole-athlete-week';
import {
  buildWholeAthleteWeek,
  configureWholeAthleteCoachStrategy,
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

  it('does not let strategy turn a protected return-to-run week into specialization', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'maximize' },
      tradeoffTolerance: 'aggressive_specialization',
    });
    const request = input({
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
});
