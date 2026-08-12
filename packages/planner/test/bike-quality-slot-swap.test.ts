import { afterEach, describe, expect, it } from 'vitest';

import {
  buildWholeAthleteWeek,
  configureWholeAthleteCoachStrategy,
  type WholeAthleteWeeklyPlannerInput,
} from '../src/whole-athlete-week-block';

function weekday(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

function input(overrides: Partial<WholeAthleteWeeklyPlannerInput> = {}): WholeAthleteWeeklyPlannerInput {
  return {
    weekStartDate: '2026-08-10',
    availableMinutes: 840,
    goalType: 'ironman_70_3',
    phase: 'build',
    health: {
      energyAvailability: 'adequate',
      menstrualRecovery: 'stable',
      boneStress: 'recent',
      injuryConstraint: 'monitor',
      mentalEnergy: 'good',
      lifeStress: 'low',
    },
    previousWeek: [],
    returnToRun: true,
    recentBoneStress: true,
    weeklySchedule: {
      preferredDays: {
        swim: [1, 3, 4],
        bike: [1, 3, 5, 0],
        run: [0, 4, 2],
        strength: [2, 0, 3],
      },
      restDays: [6],
      hardBikeDay: 1,
      longBikeDay: 5,
      groupSwimDays: [1, 3],
    },
    ...overrides,
  };
}

afterEach(() => configureWholeAthleteCoachStrategy(undefined));

describe('bike quality slot swap', () => {
  it('makes room for Tuesday bike quality without creating a third session', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });

    const plan = buildWholeAthleteWeek(input());
    const tuesday = plan.sessions.filter((session) => weekday(session.date) === 1);
    const hardBikes = plan.sessions.filter((session) =>
      session.discipline === 'bike'
      && (session.intensity === 'hard' || session.intensity === 'max' || session.recoveryCost >= 4)
    );

    expect(tuesday).toHaveLength(2);
    expect(tuesday.some((session) => session.discipline === 'bike')).toBe(true);
    expect(tuesday.some((session) => session.discipline === 'swim')).toBe(true);
    expect(tuesday.some((session) => session.discipline === 'strength')).toBe(false);

    expect(hardBikes).toHaveLength(1);
    expect(weekday(hardBikes[0]!.date)).toBe(1);

    const sundayTrainable = plan.sessions.filter((session) =>
      weekday(session.date) === 6
      && ['swim', 'bike', 'run', 'strength'].includes(session.discipline)
    );
    expect(sundayTrainable).toHaveLength(0);

    const strengths = plan.sessions.filter((session) => session.discipline === 'strength');
    expect(strengths).toHaveLength(2);
  });
});
