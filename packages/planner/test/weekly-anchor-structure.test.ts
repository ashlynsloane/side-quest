import { describe, expect, it } from 'vitest';

import type { UnifiedTrainingSession } from '../src/unified-training';
import { buildWholeAthleteWeek } from '../src/whole-athlete-week';
import { buildWholeAthleteWeek as buildFinalWholeAthleteWeek } from '../src/whole-athlete-week-block';

function session(
  id: string,
  date: string,
  discipline: UnifiedTrainingSession['discipline'],
  durationMinutes: number,
  intensity: UnifiedTrainingSession['intensity'] = 'easy',
): UnifiedTrainingSession {
  const hard = intensity === 'hard' || intensity === 'max';
  return {
    id,
    date,
    title: id,
    discipline,
    durationMinutes,
    intensity,
    cardiovascularDemand: hard ? 'high' : 'low',
    musculoskeletalDemand: discipline === 'run' ? 'moderate' : 'low',
    lowerBodyDemand:
      discipline === 'bike' || discipline === 'run' || discipline === 'strength'
        ? hard ? 'high' : 'moderate'
        : 'none',
    upperBodyDemand: discipline === 'swim' ? 'moderate' : 'none',
    impact: discipline === 'run' ? 'moderate' : 'none',
    technicalDemand: 'moderate',
    recoveryCost: hard ? 4 : intensity === 'moderate' ? 3 : 1,
    priority: hard ? 'required' : 'recommended',
    source: 'manual',
    keySession: hard,
  };
}

describe('weekly anchor structure', () => {
  it('expresses the canonical automatic 70.3 weekday scaffold', () => {
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

    const generated = plan.sessions.filter(
      (session) => session.planningCommitment === 'generated'
        && session.discipline !== 'rest'
        && session.discipline !== 'mobility',
    );
    const dates = (discipline: string) => new Set(
      generated.filter((item) => item.discipline === discipline).map((item) => item.date),
    );

    expect(generated.some((item) => item.date === '2026-08-10')).toBe(false);

    expect(dates('bike')).toEqual(new Set([
      '2026-08-11',
      '2026-08-13',
      '2026-08-15',
    ]));
    expect(dates('swim')).toEqual(new Set([
      '2026-08-11',
      '2026-08-13',
      '2026-08-16',
    ]));
    expect(dates('run')).toEqual(new Set([
      '2026-08-12',
      '2026-08-14',
      '2026-08-16',
    ]));
    expect(dates('strength')).toEqual(new Set([
      '2026-08-12',
      '2026-08-14',
    ]));

    const byDate = new Map<string, number>();
    for (const session of generated) {
      byDate.set(session.date, (byDate.get(session.date) ?? 0) + 1);
    }
    expect([...byDate.values()].every((count) => count <= 2)).toBe(true);
  });

  it('uses previous-week load when protecting Monday key work', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 420,
      goalType: 'ironman_70_3',
      phase: 'build',
      previousWeek: [
        session('sunday-hard-bike', '2026-08-09', 'bike', 180, 'hard'),
      ],
      frequencyTargets: {
        swim: { min: 0, preferred: 0, max: 0 },
        bike: { min: 1, preferred: 1, max: 1 },
        run: { min: 0, preferred: 0, max: 0 },
        strength: { min: 0, preferred: 0, max: 0 },
      },
      weeklySchedule: {
        preferredDays: { bike: [0, 1] },
        hardBikeDay: 0,
        restDays: [6],
      },
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    const bike = plan.sessions.find((item) => item.discipline === 'bike');
    expect(bike?.date).not.toBe('2026-08-10');
  });

  it('lets athlete availability override default swim weekdays', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 300,
      goalType: 'ironman_70_3',
      phase: 'build',
      frequencyTargets: {
        swim: { min: 2, preferred: 2, max: 2 },
        bike: { min: 0, preferred: 0, max: 0 },
        run: { min: 0, preferred: 0, max: 0 },
        strength: { min: 0, preferred: 0, max: 0 },
      },
      weeklySchedule: {
        preferredDays: { swim: [0, 2] },
        groupSwimDays: [0, 2],
        restDays: [6],
      },
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    const dates = plan.sessions
      .filter((item) => item.discipline === 'swim')
      .map((item) => item.date);

    expect(new Set(dates)).toEqual(new Set(['2026-08-10', '2026-08-12']));
  });
});
