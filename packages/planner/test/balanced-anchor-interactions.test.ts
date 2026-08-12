import { describe, expect, it } from 'vitest';

import { buildWholeAthleteWeek } from '../src/whole-athlete-week';
import { buildWholeAthleteWeek as buildFinalWholeAthleteWeek } from '../src/whole-athlete-week-block';

describe('balanced 70.3 anchor interactions', () => {
  it('uses Tue/Thu/Sat for the normal three-bike structure', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 900,
      goalType: 'ironman_70_3',
      phase: 'build',
      maxSessionsPerDay: 2,
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    const bikeDates = new Set(
      plan.sessions
        .filter((session) => session.discipline === 'bike')
        .map((session) => session.date),
    );

    expect(bikeDates).toEqual(new Set([
      '2026-08-11',
      '2026-08-13',
      '2026-08-15',
    ]));
  });

  it('consolidates run + strength on Wednesday while keeping the long run on Sunday', () => {
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
