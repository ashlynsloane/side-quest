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

afterEach(() => configureWholeAthleteCoachStrategy(undefined));

describe('swim role anchors', () => {
  it('anchors generated 70.3 swims to Tue quality, Thu easy, Sun recovery', () => {
    const plan = buildWholeAthleteWeek(input());
    const swims = plan.sessions
      .filter((session) => session.discipline === 'swim')
      .sort((left, right) => weekday(left.date) - weekday(right.date));

    expect(swims).toHaveLength(3);
    expect(swims.map((session) => weekday(session.date))).toEqual([1, 3, 6]);

    const quality = swims.find((session) => session.keySession || session.intensity === 'moderate' || session.intensity === 'hard');
    expect(quality).toBeDefined();
    expect(weekday(quality!.date)).toBe(1);

    const thursday = swims.find((session) => weekday(session.date) === 3);
    const sunday = swims.find((session) => weekday(session.date) === 6);
    expect(thursday?.intensity).toBe('easy');
    expect(sunday?.intensity).toBe('easy');
  });

  it('uses explicit athlete swim weekdays instead of the canonical defaults', () => {
    const plan = buildWholeAthleteWeek(input({
      weeklySchedule: {
        preferredDays: { swim: [0, 2, 4] },
        restDays: [6],
        groupSwimDays: [2],
      },
    }));

    const swims = plan.sessions.filter((session) => session.discipline === 'swim');
    expect(swims.map((session) => weekday(session.date)).sort()).toEqual([0, 2, 4]);
    const quality = swims.find((session) => session.keySession || session.intensity === 'moderate' || session.intensity === 'hard');
    expect(quality).toBeDefined();
    expect(weekday(quality!.date)).toBe(2);
  });
});
