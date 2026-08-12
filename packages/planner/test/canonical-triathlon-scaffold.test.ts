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

function baseInput(overrides: Partial<WholeAthleteWeeklyPlannerInput> = {}): WholeAthleteWeeklyPlannerInput {
  return {
    weekStartDate: '2026-08-10',
    availableMinutes: 840,
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

function isHard(session: { intensity: string; recoveryCost: number }): boolean {
  return session.intensity === 'hard' || session.intensity === 'max' || session.recoveryCost >= 4;
}

afterEach(() => configureWholeAthleteCoachStrategy(undefined));

describe('canonical 70.3 weekly scaffold', () => {
  it('uses Mon rest, Tue quality pair, Wed/Fri run+strength, Thu support pair, Sat long bike, Sun long run+recovery swim', () => {
    const plan = buildWholeAthleteWeek(baseInput());
    const trainable = plan.sessions.filter((session) =>
      session.discipline === 'swim'
      || session.discipline === 'bike'
      || session.discipline === 'run'
      || session.discipline === 'strength');

    expect(trainable.filter((session) => weekday(session.date) === 0)).toHaveLength(0);

    const swims = trainable.filter((session) => session.discipline === 'swim');
    expect(swims).toHaveLength(3);
    expect(new Set(swims.map((session) => session.date)).size).toBe(3);
    expect(swims.map((session) => weekday(session.date)).sort()).toEqual([1, 3, 6]);

    const tuesdaySwim = swims.find((session) => weekday(session.date) === 1);
    expect(tuesdaySwim).toBeDefined();
    expect(tuesdaySwim?.keySession).toBe(true);
    expect(['moderate', 'hard']).toContain(tuesdaySwim?.intensity);

    const easySwims = swims.filter((session) => weekday(session.date) === 3 || weekday(session.date) === 6);
    expect(easySwims.every((session) => session.intensity === 'easy')).toBe(true);

    const bikes = trainable.filter((session) => session.discipline === 'bike');
    expect(bikes).toHaveLength(3);
    const qualityBike = bikes.find(isHard);
    expect(qualityBike).toBeDefined();
    expect(weekday(qualityBike!.date)).toBe(1);

    const longBike = bikes.find((session) => /long ride/i.test(session.title));
    expect(longBike).toBeDefined();
    expect(weekday(longBike!.date)).toBe(5);

    const supportBike = bikes.find((session) => session.id !== qualityBike?.id && session.id !== longBike?.id);
    expect(supportBike).toBeDefined();
    expect(weekday(supportBike!.date)).toBe(3);
    expect(isHard(supportBike!)).toBe(false);

    const runs = trainable.filter((session) => session.discipline === 'run');
    expect(runs).toHaveLength(3);
    expect(runs.map((session) => weekday(session.date)).sort()).toEqual([2, 4, 6]);
    const longRun = runs.find((session) => /long/i.test(session.title));
    expect(longRun).toBeDefined();
    expect(weekday(longRun!.date)).toBe(6);

    const strengths = trainable.filter((session) => session.discipline === 'strength');
    expect(strengths).toHaveLength(2);
    expect(strengths.map((session) => weekday(session.date)).sort()).toEqual([2, 4]);
  });

  it('keeps the same weekday scaffold under return-to-run without forcing a true long run', () => {
    const plan = buildWholeAthleteWeek(baseInput({
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
    }));

    const runs = plan.sessions.filter((session) => session.discipline === 'run');
    expect(runs).toHaveLength(3);
    expect(runs.map((session) => weekday(session.date)).sort()).toEqual([2, 4, 6]);
    expect(runs.every((session) => session.intensity === 'easy' && session.durationMinutes <= 30)).toBe(true);
    expect(runs.every((session) => !/long/i.test(session.title))).toBe(true);

    const swims = plan.sessions.filter((session) => session.discipline === 'swim');
    expect(new Set(swims.map((session) => session.date)).size).toBe(swims.length);
    expect(swims.filter((session) => weekday(session.date) === 1)).toHaveLength(1);

    const mondayTrainable = plan.sessions.filter((session) =>
      weekday(session.date) === 0
      && ['swim', 'bike', 'run', 'strength'].includes(session.discipline));
    expect(mondayTrainable).toHaveLength(0);
  });

  it('still honors an athlete-selected alternate rest day and explicit weekday preferences', () => {
    const plan = buildWholeAthleteWeek(baseInput({
      weeklySchedule: {
        preferredDays: {
          swim: [0, 2, 4],
          bike: [1, 3, 5],
          run: [1, 3, 5],
          strength: [2, 4],
        },
        restDays: [6],
        hardBikeDay: 1,
        longBikeDay: 5,
        hardRunDay: 3,
        longRunDay: 5,
        groupSwimDays: [2],
      },
    }));

    const sunday = plan.sessions.filter((session) =>
      weekday(session.date) === 6
      && ['swim', 'bike', 'run', 'strength'].includes(session.discipline));
    expect(sunday).toHaveLength(0);
  });
});
