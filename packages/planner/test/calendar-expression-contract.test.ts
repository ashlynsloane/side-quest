import { afterEach, describe, expect, it } from 'vitest';

import {
  buildWholeAthleteWeek,
  configureWholeAthleteCoachStrategy,
  type WholeAthleteWeeklyPlannerInput,
} from '../src/whole-athlete-week-block';

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

function weekday(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

function hard(session: { intensity: string; recoveryCost: number }): boolean {
  return session.intensity === 'hard' || session.intensity === 'max' || session.recoveryCost >= 4;
}

afterEach(() => configureWholeAthleteCoachStrategy(undefined));

describe('visible weekly calendar contract', () => {
  it('keeps bike quality on Tuesday and the long ride on Saturday', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });

    const plan = buildWholeAthleteWeek(input());
    const bikes = plan.sessions.filter((session) => session.discipline === 'bike');
    const quality = bikes.filter(hard);
    const long = bikes.filter((session) => /long ride/i.test(session.title));

    expect(quality).toHaveLength(1);
    expect(weekday(quality[0]!.date)).toBe(1);
    expect(long).toHaveLength(1);
    expect(weekday(long[0]!.date)).toBe(5);
  });

  it('does not let prior-week ordinal rhythm drag bike quality back to Wednesday', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });

    const first = buildWholeAthleteWeek(input());
    const second = buildWholeAthleteWeek(input({
      weekStartDate: '2026-08-17',
      previousWeek: first.sessions,
    }));
    const quality = second.sessions.filter((session) => session.discipline === 'bike').filter(hard);

    expect(quality).toHaveLength(1);
    expect(weekday(quality[0]!.date)).toBe(1);
  });

  it('protects Sunday and never creates a generated same-discipline double day', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });

    const plan = buildWholeAthleteWeek(input());
    const trainable = plan.sessions.filter((session) =>
      session.discipline === 'swim'
      || session.discipline === 'bike'
      || session.discipline === 'run'
      || session.discipline === 'strength');

    expect(trainable.filter((session) => weekday(session.date) === 6)).toHaveLength(0);

    const seen = new Set<string>();
    for (const session of trainable.filter((item) => item.planningCommitment === 'generated')) {
      const key = `${session.date}:${session.discipline}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
