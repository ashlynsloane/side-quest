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

const bike = {
  startsAt: '2026-08-17',
  endsAt: '2026-09-06',
  primaryFocus: 'bike' as const,
  disciplineObjectives: { bike: 'maximize' as const, swim: 'maintain' as const, run: 'maintain' as const },
  tradeoffTolerance: 'aggressive_specialization' as const,
};
const run = {
  startsAt: '2026-09-21',
  endsAt: '2026-10-11',
  primaryFocus: 'run' as const,
  disciplineObjectives: { run: 'primary_focus' as const, swim: 'maintain' as const, bike: 'maintain' as const },
  tradeoffTolerance: 'moderate_tradeoff' as const,
};

function input(weekStartDate: string): WholeAthleteWeeklyPlannerInput {
  return {
    weekStartDate,
    availableMinutes: 900,
    goalType: 'ironman_70_3',
    phase: 'build',
    health: {
      energyAvailability: 'adequate', menstrualRecovery: 'stable', boneStress: 'none', injuryConstraint: 'none', mentalEnergy: 'good', lifeStress: 'low',
    },
    previousWeek: [],
  };
}

afterEach(() => configureWholeAthleteCoachStrategy(undefined));

describe('season strategy macrocycle', () => {
  it('shows each approved focus block and explicit handoffs back through Race Intent', () => {
    configureWholeAthleteStrategyLayers(raceIntent, [bike, run]);
    const starts = ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'];
    const weeks = starts.map((weekStartDate) => ({ phase: 'build' as const, plan: buildWholeAthleteWeek(input(weekStartDate)) }));
    const macro = buildStrategyMacrocycle({
      raceIntent,
      approvedStrategies: [
        { id: 'bike-block', strategy: bike },
        { id: 'run-block', strategy: run },
      ],
      weeks,
      referenceWeekStart: '2026-08-17',
    });

    expect(macro?.seasonWindows.map((window) => window.id)).toEqual(['bike-block', 'run-block']);
    expect(macro?.weeks.map((week) => week.strategyWindowId ?? 'race')).toEqual([
      'race', 'bike-block', 'bike-block', 'bike-block', 'race', 'race', 'run-block', 'run-block', 'run-block', 'race',
    ]);
    expect(macro?.handoffs).toEqual([
      { weekStartDate: '2026-08-17', from: 'race_intent', to: 'strategy_coach', fromWindowId: undefined, toWindowId: 'bike-block' },
      { weekStartDate: '2026-09-07', from: 'strategy_coach', to: 'race_intent', fromWindowId: 'bike-block', toWindowId: undefined },
      { weekStartDate: '2026-09-21', from: 'race_intent', to: 'strategy_coach', fromWindowId: undefined, toWindowId: 'run-block' },
      { weekStartDate: '2026-10-12', from: 'strategy_coach', to: 'race_intent', fromWindowId: 'run-block', toWindowId: undefined },
    ]);
    expect(macro?.activeWindowId).toBe('bike-block');
    expect(macro?.nextWindowId).toBe('run-block');
  });
});
