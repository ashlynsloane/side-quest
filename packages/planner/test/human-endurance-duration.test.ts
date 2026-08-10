import { describe, expect, it } from 'vitest';

import { buildWholeAthleteWeek } from '../src/whole-athlete-week';

describe('human endurance duration grammar', () => {
  it('keeps generated swim, bike, and run durations on five-minute boundaries', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 600,
      goalType: 'ironman_70_3',
      phase: 'build',
      baselines: {
        swim: { sessionsPerWeek: 2, minutesPerWeek: 73 },
        bike: { sessionsPerWeek: 2, minutesPerWeek: 196 },
        run: { sessionsPerWeek: 2, minutesPerWeek: 93 },
      },
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'moderate',
      },
    });

    const generatedEndurance = plan.sessions.filter((session) =>
      session.planningCommitment === 'generated'
      && (session.discipline === 'swim' || session.discipline === 'bike' || session.discipline === 'run'));

    expect(generatedEndurance.length).toBeGreaterThan(0);
    expect(generatedEndurance.every((session) => session.durationMinutes % 5 === 0)).toBe(true);
    expect(generatedEndurance.some((session) => session.durationMinutes === 83 || session.durationMinutes === 31)).toBe(false);
  });
});
