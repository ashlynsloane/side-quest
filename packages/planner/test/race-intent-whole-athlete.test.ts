import { afterEach, describe, expect, it } from 'vitest';

import { raceIntentToCoachStrategy } from '../src/race-intent';
import {
  buildWholeAthleteWeek,
  configureWholeAthleteCoachStrategy,
} from '../src/whole-athlete-week-strategy';
import type { WholeAthleteWeeklyPlannerInput } from '../src/whole-athlete-week';

const base: WholeAthleteWeeklyPlannerInput = {
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
};

afterEach(() => configureWholeAthleteCoachStrategy(undefined));

describe('Race Intent V2 whole-athlete planning', () => {
  it('turns a bike-focused 70.3 race intent into bike-first progression while protecting swim/run floors', () => {
    configureWholeAthleteCoachStrategy(raceIntentToCoachStrategy({
      version: 2,
      overallObjective: 'discipline_performance',
      primaryDiscipline: 'bike',
      disciplinePriorities: { swim: 'maintain', bike: 'primary_focus', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
      disciplineTargets: { bike: { kind: 'pr' } },
    }));
    const plan = buildWholeAthleteWeek(base);
    expect(plan.progressionBudget.primary).toBe('bike_volume');
    expect(plan.disciplineSummary.find((item) => item.discipline === 'bike')?.targetPreferred).toBe(4);
    expect(plan.disciplineSummary.find((item) => item.discipline === 'swim')?.targetMin).toBe(2);
    expect(plan.disciplineSummary.find((item) => item.discipline === 'run')?.targetMin).toBe(2);
  });

  it('supports a swim-PR 70.3 intent without erasing bike or run preparation', () => {
    configureWholeAthleteCoachStrategy(raceIntentToCoachStrategy({
      version: 2,
      overallObjective: 'discipline_performance',
      primaryDiscipline: 'swim',
      disciplinePriorities: { swim: 'maximize', bike: 'minimum_viable', run: 'minimum_viable' },
      tradeoffTolerance: 'aggressive_specialization',
      disciplineTargets: { swim: { kind: 'pr' } },
    }));
    const plan = buildWholeAthleteWeek(base);
    expect(plan.progressionBudget.primary).toBe('swim_volume');
    expect(plan.disciplineSummary.find((item) => item.discipline === 'swim')?.targetPreferred).toBeGreaterThanOrEqual(4);
    expect(plan.disciplineSummary.find((item) => item.discipline === 'bike')?.targetMin).toBe(2);
    expect(plan.disciplineSummary.find((item) => item.discipline === 'run')?.targetMin).toBe(2);
  });
});
