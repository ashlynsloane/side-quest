import { describe, expect, it } from 'vitest';

import { buildWholeAthleteWeek } from '../src/whole-athlete-week';
import { buildWholeAthleteWeek as buildFinalWholeAthleteWeek } from '../src/whole-athlete-week-block';

describe('anchor flexibility', () => {
  it('keeps at least two strength sessions in a balanced 70.3 week', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 600,
      goalType: 'ironman_70_3',
      phase: 'build',
      maxSessionsPerDay: 2,
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'moderate',
      },
    });

    expect(
      plan.sessions.filter((session) => session.discipline === 'strength').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('preserves Sunday rest while allowing an explicitly requested fourth bike', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 900,
      goalType: 'ironman_70_3',
      phase: 'build',
      maxSessionsPerDay: 2,
      frequencyTargets: {
        bike: { min: 4, preferred: 4, max: 5 },
      },
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    const bikes = plan.sessions.filter((session) => session.discipline === 'bike');
    expect(bikes.length).toBeGreaterThanOrEqual(4);
    expect(bikes.some((session) => session.date === '2026-08-16')).toBe(false);
  });

  it('keeps Wednesday as run + strength while reserving the long-run slot for Sunday', () => {
    const plan = buildFinalWholeAthleteWeek({
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

    const wednesday = plan.sessions.filter((session) => session.date === '2026-08-12');
    const sunday = plan.sessions.filter((session) => session.date === '2026-08-16');

    expect(wednesday.some((session) => session.discipline === 'run')).toBe(true);
    expect(wednesday.some((session) => session.discipline === 'strength')).toBe(true);

    const sundayRun = sunday.find((session) => session.discipline === 'run');
    expect(sundayRun).toBeDefined();
    expect(sundayRun?.keySession).toBe(true);
    expect(sundayRun?.intensity === 'moderate' || /long/i.test(sundayRun?.title ?? '')).toBe(true);
  });
});
