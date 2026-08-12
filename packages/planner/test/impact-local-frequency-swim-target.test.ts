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
      boneStress: 'recent',
      injuryConstraint: 'monitor',
      mentalEnergy: 'good',
      lifeStress: 'low',
    },
    previousWeek: [],
    returnToRun: true,
    recentBoneStress: true,
    ...overrides,
  };
}

function disciplineDays(plan: ReturnType<typeof buildWholeAthleteWeek>, discipline: string): number[] {
  return plan.sessions
    .filter((session) => session.discipline === discipline)
    .map((session) => weekday(session.date))
    .sort((left, right) => left - right);
}

afterEach(() => configureWholeAthleteCoachStrategy(undefined));

describe('impact-local frequency and unique swim targets', () => {
  it('keeps three non-impact 70.3 swims and bikes during clean return-to-run protection', () => {
    const plan = buildWholeAthleteWeek(baseInput());

    expect(disciplineDays(plan, 'swim')).toEqual([1, 3, 6]);
    expect(disciplineDays(plan, 'bike')).toEqual([1, 3, 5]);

    const runs = plan.sessions.filter((session) => session.discipline === 'run');
    expect(runs.every((session) => session.intensity === 'easy')).toBe(true);
    expect(runs.every((session) => session.durationMinutes <= 30)).toBe(true);
    expect(runs.every((session) => !/long/i.test(session.title))).toBe(true);

    const mondayTrainable = plan.sessions.filter((session) =>
      weekday(session.date) === 0
      && ['swim', 'bike', 'run', 'strength'].includes(session.discipline));
    expect(mondayTrainable).toHaveLength(0);
  });

  it('uses all distinct explicit swim weekdays even when two are marked group-swim days', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });

    const plan = buildWholeAthleteWeek(baseInput({
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
    }));

    expect(disciplineDays(plan, 'swim')).toEqual([1, 3, 4]);

    const generated = plan.sessions.filter((session) =>
      session.planningCommitment === 'generated'
      && ['swim', 'bike', 'run', 'strength'].includes(session.discipline));
    const keys = generated.map((session) => `${session.date}:${session.discipline}`);
    expect(new Set(keys).size).toBe(keys.length);

    const sunday = generated.filter((session) => weekday(session.date) === 6);
    expect(sunday).toHaveLength(0);
  });

  it('still collapses whole-week frequency when the recovery constraint is systemic', () => {
    const plan = buildWholeAthleteWeek(baseInput({
      health: {
        energyAvailability: 'concerning',
        menstrualRecovery: 'disrupted',
        boneStress: 'recent',
        injuryConstraint: 'monitor',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    }));

    expect(plan.sessions.filter((session) => session.discipline === 'swim').length).toBeLessThanOrEqual(2);
    expect(plan.sessions.filter((session) => session.discipline === 'bike').length).toBeLessThanOrEqual(2);
  });
});
