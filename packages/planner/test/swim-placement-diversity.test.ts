import { describe, expect, it } from 'vitest';

import { buildWholeAthleteWeek } from '../src/whole-athlete-week-block';

function weekday(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

describe('swim placement in a balanced multisport week', () => {
  it('pairs the automatic Tue/Thu/Sun swims with compatible bike/run work', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 900,
      goalType: 'ironman_70_3',
      phase: 'build',
      maxSessionsPerDay: 2,
      health: {
        energyAvailability: 'adequate',
        menstrualRecovery: 'stable',
        boneStress: 'none',
        injuryConstraint: 'none',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
      previousWeek: [],
    });

    const trainable = plan.sessions.filter(
      (session) => session.discipline !== 'rest' && session.discipline !== 'mobility',
    );
    const swims = trainable.filter((session) => session.discipline === 'swim');

    expect(swims).toHaveLength(3);
    expect(swims.map((session) => weekday(session.date)).sort()).toEqual([1, 3, 6]);

    for (const swim of swims) {
      expect(
        trainable.some((other) => other.id !== swim.id && other.date === swim.date),
      ).toBe(true);
    }

    const tuesday = trainable.filter((session) => weekday(session.date) === 1);
    const thursday = trainable.filter((session) => weekday(session.date) === 3);
    const sunday = trainable.filter((session) => weekday(session.date) === 6);

    expect(tuesday.some((session) => session.discipline === 'bike')).toBe(true);
    expect(tuesday.some((session) => session.discipline === 'swim')).toBe(true);
    expect(thursday.some((session) => session.discipline === 'bike')).toBe(true);
    expect(thursday.some((session) => session.discipline === 'swim')).toBe(true);
    expect(sunday.some((session) => session.discipline === 'run')).toBe(true);
    expect(sunday.some((session) => session.discipline === 'swim')).toBe(true);
  });
});
