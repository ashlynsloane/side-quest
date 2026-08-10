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
    ...overrides,
  };
}

afterEach(() => configureWholeAthleteCoachStrategy(undefined));

describe('long-course weekend bike anchor', () => {
  it('concentrates bike durability into one weekend long ride instead of several medium-long rides', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });

    const plan = buildWholeAthleteWeek(input());
    const bikes = plan.sessions.filter((session) => session.discipline === 'bike');
    const longRides = bikes.filter((session) => /long ride/i.test(session.title));
    const longRide = longRides[0];
    const supportRides = bikes.filter((session) => session.id !== longRide?.id);

    expect(bikes.length).toBeGreaterThanOrEqual(4);
    expect(longRides).toHaveLength(1);
    expect(longRide).toBeDefined();
    expect(weekdayIndex(longRide!.date)).toBeGreaterThanOrEqual(5);
    expect(longRide!.durationMinutes).toBeGreaterThanOrEqual(180);
    expect(longRide!.keySession).toBe(true);
    expect(longRide!.durationMinutes - Math.max(...supportRides.map((session) => session.durationMinutes))).toBeGreaterThanOrEqual(30);
    expect(supportRides.every((session) => !/long ride/i.test(session.title))).toBe(true);
    expect(plan.plannedMinutes).toBeLessThanOrEqual(840);
    expect(plan.guardrails.join(' ')).toContain('Saturday/Sunday long-ride anchor');
  });
});

function weekdayIndex(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 6 : day - 1;
}
