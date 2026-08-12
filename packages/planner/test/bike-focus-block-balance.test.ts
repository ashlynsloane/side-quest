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

describe('bike-focus long-course block balance', () => {
  it('uses one weekday bike workout, one weekend long ride, and supportive remaining rides', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });

    const plan = buildWholeAthleteWeek(input());
    const bikes = plan.sessions.filter((session) => session.discipline === 'bike');
    const quality = bikes.filter(hard);
    const long = bikes.filter((session) => /long ride/i.test(session.title));

    expect(bikes.length).toBeGreaterThanOrEqual(4);
    expect(quality).toHaveLength(1);
    expect(weekday(quality[0]!.date)).toBeLessThan(5);
    expect(quality[0]!.title).toMatch(/threshold|fartlek|quality/i);
    expect(quality[0]!.durationMinutes).toBeLessThanOrEqual(105);

    expect(long).toHaveLength(1);
    expect(weekday(long[0]!.date)).toBeGreaterThanOrEqual(5);
    expect(hard(long[0]!)).toBe(false);
    expect(long[0]!.durationMinutes).toBeGreaterThanOrEqual(180);

    const support = bikes.filter((session) => session.id !== quality[0]!.id && session.id !== long[0]!.id);
    expect(support.every((session) => !hard(session))).toBe(true);
    expect(support.every((session) => session.durationMinutes <= 120)).toBe(true);

    const runs = plan.sessions.filter((session) => session.discipline === 'run');
    expect(runs).toHaveLength(3);
    expect(runs.every((session) => session.intensity === 'easy' && session.durationMinutes <= 30)).toBe(true);
    const runDates = runs
      .map((session) => Date.parse(`${session.date}T12:00:00Z`))
      .sort((left, right) => left - right);
    expect(runDates.slice(1).every((date, index) => (date - runDates[index]!) / 86_400_000 >= 2)).toBe(true);
    expect(new Set(bikes.map((session) => session.date)).size).toBe(bikes.length);

    const trainableByDate = new Map<string, number>();
    for (const session of plan.sessions.filter((session) =>
      session.discipline === 'swim'
      || session.discipline === 'bike'
      || session.discipline === 'run'
      || session.discipline === 'strength')) {
      trainableByDate.set(session.date, (trainableByDate.get(session.date) ?? 0) + 1);
    }
    expect([...trainableByDate.values()].every((count) => count <= 2)).toBe(true);
  });

  it('does not count an accidental same-day swim double as useful frequency', () => {
    configureWholeAthleteCoachStrategy({
      primaryFocus: 'bike',
      disciplineObjectives: { bike: 'primary_focus', swim: 'maintain', run: 'maintain' },
      tradeoffTolerance: 'moderate_tradeoff',
    });

    const plan = buildWholeAthleteWeek(input());
    const swims = plan.sessions.filter((session) => session.discipline === 'swim');
    expect(new Set(swims.map((session) => session.date)).size).toBe(swims.length);
  });
});
