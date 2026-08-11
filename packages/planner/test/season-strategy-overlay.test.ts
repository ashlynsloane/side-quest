import { afterEach, describe, expect, it } from 'vitest';

import type { WholeAthleteWeeklyPlannerInput } from '../src/whole-athlete-week';
import {
  buildWholeAthleteWeek,
  configureWholeAthleteCoachStrategy,
  configureWholeAthleteStrategyLayers,
} from '../src/whole-athlete-week-strategy';

function input(weekStartDate: string): WholeAthleteWeeklyPlannerInput {
  return {
    weekStartDate,
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
}

afterEach(() => configureWholeAthleteCoachStrategy(undefined));

describe('season strategy planner overlay', () => {
  it('moves through sequential focus blocks and returns to Race Intent in the gaps', () => {
    configureWholeAthleteStrategyLayers({
      version: 2,
      overallObjective: 'discipline_performance',
      primaryDiscipline: 'swim',
      disciplinePriorities: { swim: 'primary_focus', bike: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    }, [
      {
        startsAt: '2026-08-17',
        endsAt: '2026-09-06',
        primaryFocus: 'bike',
        disciplineObjectives: { bike: 'maximize', swim: 'maintain', run: 'maintain' },
        tradeoffTolerance: 'aggressive_specialization',
      },
      {
        startsAt: '2026-09-21',
        endsAt: '2026-10-18',
        primaryFocus: 'run',
        disciplineObjectives: { run: 'primary_focus', swim: 'maintain', bike: 'maintain' },
        tradeoffTolerance: 'moderate_tradeoff',
      },
    ]);

    expect(buildWholeAthleteWeek(input('2026-08-10')).progressionBudget.primary).toBe('swim_volume');
    expect(buildWholeAthleteWeek(input('2026-08-24')).progressionBudget.primary).toBe('bike_volume');
    expect(buildWholeAthleteWeek(input('2026-09-14')).progressionBudget.primary).toBe('swim_volume');
    expect(buildWholeAthleteWeek(input('2026-09-28')).progressionBudget.primary).toBe('run_volume');
    expect(buildWholeAthleteWeek(input('2026-10-19')).progressionBudget.primary).toBe('swim_volume');
  });
});
