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
  keySession = false,
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
      discipline === 'run' || discipline === 'bike' || discipline === 'strength'
        ? hard ? 'high' : 'moderate'
        : 'none',
    upperBodyDemand: discipline === 'swim' ? 'moderate' : 'none',
    impact: discipline === 'run' ? 'moderate' : 'none',
    technicalDemand: 'moderate',
    recoveryCost: hard ? 4 : intensity === 'moderate' ? 3 : 1,
    priority: keySession || hard ? 'required' : 'recommended',
    source: 'manual',
    keySession: keySession || hard,
  };
}

const zero = { min: 0, preferred: 0, max: 0 };

describe('whole-athlete week coherence', () => {
  it('consolidates the automatic 70.3 week onto six coherent training days', () => {
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

    const trainable = plan.sessions.filter(
      (session) => session.discipline !== 'rest' && session.discipline !== 'mobility',
    );
    const byDate = new Map<string, typeof trainable>();

    for (const session of trainable) {
      const items = byDate.get(session.date) ?? [];
      items.push(session);
      byDate.set(session.date, items);
    }

    expect(new Set(trainable.map((session) => session.date)).size).toBe(6);
    expect(trainable.some((session) => session.date === '2026-08-10')).toBe(false);
    expect([...byDate.values()].every((items) => items.length <= 2)).toBe(true);

    const bikeSwimPairs = [...byDate.values()].filter(
      (items) => items.some((item) => item.discipline === 'bike')
        && items.some((item) => item.discipline === 'swim'),
    );
    const runStrengthPairs = [...byDate.values()].filter(
      (items) => items.some((item) => item.discipline === 'run')
        && items.some((item) => item.discipline === 'strength'),
    );
    const runSwimPairs = [...byDate.values()].filter(
      (items) => items.some((item) => item.discipline === 'run')
        && items.some((item) => item.discipline === 'swim'),
    );

    expect(bikeSwimPairs).toHaveLength(2);
    expect(runStrengthPairs).toHaveLength(2);
    expect(runSwimPairs).toHaveLength(1);
  });

  it('protects a fixed key bike session from adjacent generated lower-body strength', () => {
    const fixedBike = session('bike-threshold', '2026-08-12', 'bike', 75, 'hard', true);
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 420,
      goalType: 'ironman_70_3',
      phase: 'build',
      fixedSessions: [fixedBike],
      maxSessionsPerDay: 2,
      frequencyTargets: {
        swim: { min: 2, preferred: 2, max: 2 },
        bike: { min: 1, preferred: 1, max: 1 },
        run: zero,
        strength: { min: 2, preferred: 2, max: 2 },
      },
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    const strengthDates = plan.sessions
      .filter((item) => item.discipline === 'strength' && item.planningCommitment === 'generated')
      .map((item) => item.date);

    expect(strengthDates).not.toContain('2026-08-11');
    expect(strengthDates).not.toContain('2026-08-13');
  });

  it('flags unavoidable fixed key-session stacking instead of pretending the week is coherent', () => {
    const fixedBike = session('bike-threshold', '2026-08-12', 'bike', 75, 'hard', true);
    const fixedRun = session('run-threshold', '2026-08-13', 'run', 50, 'hard', true);

    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 240,
      goalType: 'ironman_70_3',
      phase: 'build',
      fixedSessions: [fixedBike, fixedRun],
      frequencyTargets: {
        swim: zero,
        bike: { min: 1, preferred: 1, max: 1 },
        run: { min: 1, preferred: 1, max: 1 },
        strength: zero,
      },
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    expect(plan.sessions.some((item) => item.id === fixedBike.id)).toBe(true);
    expect(plan.sessions.some((item) => item.id === fixedRun.id)).toBe(true);
    expect(plan.warnings.some((warning) => warning.includes('Key lower-body sessions are stacked'))).toBe(true);
  });
});
