import { afterEach, describe, expect, it } from 'vitest';

import {
  buildWholeAthleteWeek,
  configureWholeAthleteCoachStrategy,
  type WholeAthleteWeeklyPlannerInput,
} from '../src/whole-athlete-week-block';

function input(): WholeAthleteWeeklyPlannerInput {
  return {
    weekStartDate: '2026-08-17',
    availableMinutes: 840,
    goalType: 'ironman_70_3',
    phase: 'base',
    health: {
      energyAvailability: 'adequate',
      menstrualRecovery: 'stable',
      boneStress: 'recent',
      injuryConstraint: 'monitor',
      mentalEnergy: 'good',
      lifeStress: 'low',
    },
    returnToRun: true,
    recentBoneStress: true,
    frequencyTargets: { run: { min: 3, preferred: 3, max: 3 } },
    weeklySchedule: {
      restDays: [0],
      hardBikeDay: 1,
      longBikeDay: 5,
      longRunDay: 6,
      groupSwimDays: [1],
      maxContinuousMinutesByDay: {
        0: 0,
        1: 120,
        2: 120,
        3: 120,
        4: 120,
        5: 420,
        6: 360,
      },
    },
  };
}

function weekday(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

function hard(session: { intensity: string; recoveryCost: number }): boolean {
  return session.intensity === 'hard' || session.intensity === 'max' || session.recoveryCost >= 4;
}

afterEach(() => configureWholeAthleteCoachStrategy(undefined));

describe('base-phase 70.3 bike quality', () => {
  it('keeps the Tuesday quality workout while return-to-run remains protected', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });

    const plan = buildWholeAthleteWeek(input());
    const bikes = plan.sessions.filter((session) => session.discipline === 'bike');
    const quality = bikes.filter(hard);
    const runs = plan.sessions.filter((session) => session.discipline === 'run');

    expect(plan.progressionBudget.primary).toBe('bike_volume');
    expect(quality).toHaveLength(1);
    expect(weekday(quality[0]!.date)).toBe(1);
    expect(quality[0]!.durationMinutes).toBeLessThanOrEqual(105);

    expect(runs).toHaveLength(3);
    expect(runs.every((session) => session.intensity === 'easy')).toBe(true);
  });
});
