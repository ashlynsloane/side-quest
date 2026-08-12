import { describe, expect, it } from 'vitest';

import { buildWholeAthleteWeek } from '../src/whole-athlete-week-block';

function weekday(date: string): number {
  const start = Date.parse('2026-08-10T12:00:00Z');
  return Math.round((Date.parse(`${date}T12:00:00Z`) - start) / 86_400_000);
}

describe('return-to-run whole-athlete contract', () => {
  it('keeps three separated easy run exposures when return-to-run impact is permitted', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 840,
      goalType: 'ironman_70_3',
      phase: 'build',
      returnToRun: true,
      recentBoneStress: true,
      health: {
        energyAvailability: 'adequate',
        menstrualRecovery: 'stable',
        boneStress: 'recent',
        injuryConstraint: 'monitor',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    const runs = plan.sessions.filter((session) => session.discipline === 'run');
    expect(runs).toHaveLength(3);
    expect(runs.map((session) => weekday(session.date)).sort()).toEqual([2, 4, 6]);
    expect(runs.every((session) => session.intensity === 'easy')).toBe(true);
    expect(runs.every((session) => session.durationMinutes <= 30)).toBe(true);
  });

  it('still suppresses generated running when impact is not permitted', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 840,
      goalType: 'ironman_70_3',
      phase: 'build',
      returnToRun: true,
      recentBoneStress: true,
      health: {
        energyAvailability: 'adequate',
        menstrualRecovery: 'stable',
        boneStress: 'active',
        injuryConstraint: 'restricted',
        noImpact: true,
        restrictedDisciplines: ['run'],
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    expect(plan.sessions.filter((session) => session.discipline === 'run')).toHaveLength(0);
  });
});
