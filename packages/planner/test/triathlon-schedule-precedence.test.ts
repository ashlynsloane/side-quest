import { describe, expect, it } from 'vitest';

import { buildWholeAthleteWeek } from '../src/whole-athlete-week-block';

function weekday(date: string, weekStartDate = '2026-08-10'): number {
  const start = new Date(`${weekStartDate}T12:00:00Z`).getTime();
  const value = new Date(`${date}T12:00:00Z`).getTime();
  return Math.round((value - start) / 86_400_000);
}

function healthyInput() {
  return {
    weekStartDate: '2026-08-10',
    availableMinutes: 900,
    goalType: 'ironman_70_3' as const,
    phase: 'build' as const,
    maxSessionsPerDay: 2 as const,
    health: {
      energyAvailability: 'adequate' as const,
      menstrualRecovery: 'stable' as const,
      boneStress: 'none' as const,
      injuryConstraint: 'none' as const,
      mentalEnergy: 'good' as const,
      lifeStress: 'low' as const,
    },
  };
}

describe('triathlon schedule precedence', () => {
  it('does not let an arbitrary previous week replace the automatic scaffold', () => {
    const previousWeek = [
      {
        id: 'old_run_tue',
        date: '2026-08-04',
        title: 'Old Tuesday run',
        discipline: 'run' as const,
        durationMinutes: 30,
        intensity: 'easy' as const,
        cardiovascularDemand: 'low' as const,
        musculoskeletalDemand: 'moderate' as const,
        lowerBodyDemand: 'moderate' as const,
        upperBodyDemand: 'none' as const,
        impact: 'moderate' as const,
        technicalDemand: 'moderate' as const,
        recoveryCost: 1 as const,
        priority: 'recommended' as const,
        source: 'manual' as const,
        keySession: false,
      },
      {
        id: 'old_bike_wed',
        date: '2026-08-05',
        title: 'Old Wednesday bike',
        discipline: 'bike' as const,
        durationMinutes: 720,
        intensity: 'hard' as const,
        cardiovascularDemand: 'high' as const,
        musculoskeletalDemand: 'moderate' as const,
        lowerBodyDemand: 'high' as const,
        upperBodyDemand: 'none' as const,
        impact: 'none' as const,
        technicalDemand: 'moderate' as const,
        recoveryCost: 4 as const,
        priority: 'required' as const,
        source: 'manual' as const,
        keySession: true,
      },
    ];

    const plan = buildWholeAthleteWeek({
      ...healthyInput(),
      previousWeek,
    });

    const trainable = plan.sessions.filter(
      (session) => session.discipline !== 'rest' && session.discipline !== 'mobility',
    );

    const days = (discipline: 'swim' | 'bike' | 'run' | 'strength') =>
      trainable
        .filter((session) => session.discipline === discipline)
        .map((session) => weekday(session.date))
        .sort((a, b) => a - b);

    expect(days('bike')).toEqual([1, 3, 5]);
    expect(days('swim')).toEqual([1, 3, 6]);
    expect(days('run')).toEqual([2, 4, 6]);
    expect(days('strength')).toEqual([2, 4]);
  });

  it('derives a coherent automatic week when Thursday is the chosen rest day', () => {
    const plan = buildWholeAthleteWeek({
      ...healthyInput(),
      weeklySchedule: {
        preferredDays: {},
        restDays: [3],
      },
    });

    const trainable = plan.sessions.filter(
      (session) => session.discipline !== 'rest' && session.discipline !== 'mobility',
    );

    const on = (day: number, discipline: string) =>
      trainable.some((session) => weekday(session.date) === day && session.discipline === discipline);

    expect(trainable.some((session) => weekday(session.date) === 3)).toBe(false);
    expect(on(0, 'bike')).toBe(true);
    expect(on(0, 'swim')).toBe(true);
    expect(on(1, 'run')).toBe(true);
    expect(on(1, 'strength')).toBe(true);
    expect(on(2, 'bike')).toBe(true);
    expect(on(2, 'swim')).toBe(true);
    expect(on(4, 'run')).toBe(true);
    expect(on(4, 'strength')).toBe(true);
    expect(on(5, 'bike')).toBe(true);
    expect(on(6, 'run')).toBe(true);
    expect(on(6, 'swim')).toBe(true);
  });

  it('still lets explicit athlete weekday preferences override the automatic rest-day scaffold', () => {
    const plan = buildWholeAthleteWeek({
      ...healthyInput(),
      weeklySchedule: {
        preferredDays: {
          swim: [0, 2, 4],
          bike: [0, 2, 5],
          run: [1, 4, 6],
          strength: [1, 4],
        },
        restDays: [3],
        hardBikeDay: 2,
        longBikeDay: 5,
        hardRunDay: 4,
        longRunDay: 6,
        groupSwimDays: [2],
      },
    });

    const trainable = plan.sessions.filter(
      (session) => session.discipline !== 'rest' && session.discipline !== 'mobility',
    );

    expect(trainable.some((session) => weekday(session.date) === 3)).toBe(false);

    const swims = trainable
      .filter((session) => session.discipline === 'swim')
      .map((session) => weekday(session.date))
      .sort((a, b) => a - b);

    expect(swims).toEqual([0, 2, 4]);
  });
});
