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
    returnToRun: true,
    recentBoneStress: true,
    previousWeek: [],
    weeklySchedule: {
      availableDays: {
        swim: [1, 2, 3, 4, 5, 6],
        bike: [1, 2, 3, 5, 6],
        run: [1, 2, 3, 4, 5, 6],
        strength: [1, 2, 3, 4, 5, 6],
      },
      maxContinuousMinutesByDay: {
        0: 0,
        1: 120,
        2: 120,
        3: 120,
        4: 120,
        5: 420,
        6: 360,
      },
      totalAvailableMinutesByDay: {
        0: 0,
        1: 120,
        2: 120,
        3: 120,
        4: 120,
        5: 420,
        6: 360,
      },
      restDays: [0],
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

describe('availability-derived long-course bike distribution', () => {
  it('uses another support ride before overflowing a two-hour weekday window', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });

    const plan = buildWholeAthleteWeek(input());
    const bikes = plan.sessions.filter((session) => session.discipline === 'bike');
    const quality = bikes.filter(hard);
    const long = bikes.filter((session) => /long ride/i.test(session.title));
    const support = bikes.filter((session) =>
      session.id !== quality[0]?.id && session.id !== long[0]?.id);

    expect(bikes.length).toBeGreaterThanOrEqual(4);
    expect(new Set(bikes.map((session) => session.date)).size).toBe(bikes.length);

    expect(quality).toHaveLength(1);
    expect(weekday(quality[0]!.date)).toBeLessThan(5);
    expect(quality[0]!.durationMinutes).toBeLessThanOrEqual(105);

    expect(long).toHaveLength(1);
    expect(weekday(long[0]!.date)).toBe(5);
    expect(long[0]!.durationMinutes).toBeGreaterThanOrEqual(180);
    expect(long[0]!.durationMinutes).toBeLessThanOrEqual(270);

    expect(support.length).toBeGreaterThanOrEqual(2);
    expect(support.every((session) => !hard(session))).toBe(true);
    expect(support.every((session) => session.durationMinutes <= 120)).toBe(true);

    for (const bike of bikes) {
      const day = weekday(bike.date) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      const cap = input().weeklySchedule!.maxContinuousMinutesByDay![day]!;
      expect(bike.durationMinutes).toBeLessThanOrEqual(cap);
    }

    const weekendSupport = support.filter((session) => weekday(session.date) === 6);
    expect(weekendSupport.length).toBeGreaterThanOrEqual(1);
    expect(weekendSupport.every((session) => session.durationMinutes <= 60)).toBe(true);

    const runs = plan.sessions.filter((session) => session.discipline === 'run');
    expect(runs).toHaveLength(3);

    const trainableByDate = new Map<string, number>();
    for (const session of plan.sessions.filter((session) =>
      session.discipline === 'swim'
      || session.discipline === 'bike'
      || session.discipline === 'run'
      || session.discipline === 'strength')) {
      trainableByDate.set(session.date, (trainableByDate.get(session.date) ?? 0) + 1);
    }
    expect([...trainableByDate.values()].every((count) => count <= 2)).toBe(true);
    expect(plan.plannedMinutes).toBeLessThanOrEqual(840);
    expect(plan.guardrails.join(' ')).toContain('frequency emerges from approved bike minutes');
  });
});
