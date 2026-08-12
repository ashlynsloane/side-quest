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
      boneStress: 'none',
      injuryConstraint: 'none',
      mentalEnergy: 'good',
      lifeStress: 'low',
    },
    previousWeek: [],
    ...overrides,
  };
}

function days(plan: ReturnType<typeof buildWholeAthleteWeek>, discipline: string): number[] {
  return plan.sessions
    .filter((session) => session.discipline === discipline)
    .map((session) => weekday(session.date))
    .sort((a, b) => a - b);
}

function maxTrainablePerDay(plan: ReturnType<typeof buildWholeAthleteWeek>): number {
  let max = 0;
  for (let wd = 0; wd < 7; wd += 1) {
    const count = plan.sessions.filter((session) =>
      weekday(session.date) === wd
      && ['swim', 'bike', 'run', 'strength'].includes(session.discipline)).length;
    max = Math.max(max, count);
  }
  return max;
}

afterEach(() => configureWholeAthleteCoachStrategy(undefined));

describe('generated scaffold conflict resolver', () => {
  it('produces the exact automatic 70.3 weekday scaffold', () => {
    const plan = buildWholeAthleteWeek(input());

    expect(plan.sessions.filter((session) =>
      weekday(session.date) === 0
      && ['swim', 'bike', 'run', 'strength'].includes(session.discipline))).toHaveLength(0);

    expect(days(plan, 'swim')).toEqual([1, 3, 6]);
    expect(days(plan, 'bike')).toEqual([1, 3, 5]);
    expect(days(plan, 'run')).toEqual([2, 4, 6]);
    expect(days(plan, 'strength')).toEqual([2, 4]);
    expect(maxTrainablePerDay(plan)).toBeLessThanOrEqual(2);
  });

  it('honors explicit Mon/Wed/Fri swimming while coherently re-solving a Sunday-rest week', () => {
    const plan = buildWholeAthleteWeek(input({
      weeklySchedule: {
        preferredDays: { swim: [0, 2, 4] },
        restDays: [6],
        groupSwimDays: [2],
      },
    }));

    expect(days(plan, 'swim')).toEqual([0, 2, 4]);
    expect(days(plan, 'bike')).toEqual([0, 2, 5]);
    expect(days(plan, 'run')).toEqual([1, 3, 4]);
    expect(days(plan, 'strength')).toEqual([1, 3]);
    expect(maxTrainablePerDay(plan)).toBeLessThanOrEqual(2);

    const sunday = plan.sessions.filter((session) =>
      weekday(session.date) === 6
      && ['swim', 'bike', 'run', 'strength'].includes(session.discipline));
    expect(sunday).toHaveLength(0);

    const friday = plan.sessions.filter((session) => weekday(session.date) === 4);
    expect(friday.some((session) => session.discipline === 'run')).toBe(true);
    expect(friday.some((session) => session.discipline === 'swim')).toBe(true);

    const saturday = plan.sessions.filter((session) => weekday(session.date) === 5);
    expect(saturday.some((session) => session.discipline === 'bike')).toBe(true);
  });

  it('keeps return-to-run dose conservative while preserving the automatic weekday skeleton', () => {
    const plan = buildWholeAthleteWeek(input({
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

    expect(days(plan, 'swim')).toEqual([1, 3, 6]);
    expect(days(plan, 'strength')).toEqual([2, 4]);

    const runs = plan.sessions.filter((session) => session.discipline === 'run');
    expect(runs.every((session) => session.intensity === 'easy')).toBe(true);
    expect(runs.every((session) => session.durationMinutes <= 30)).toBe(true);
    expect(runs.every((session) => !/long/i.test(session.title))).toBe(true);
  });
});
