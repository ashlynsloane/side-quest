import { describe, expect, it } from 'vitest';

import type { UnifiedTrainingSession } from '../src/unified-training';
import { buildWholeAthleteWeek } from '../src/whole-athlete-week';

function session(
  id: string,
  date: string,
  discipline: UnifiedTrainingSession['discipline'],
  durationMinutes: number,
  intensity: UnifiedTrainingSession['intensity'] = 'easy',
  priority: UnifiedTrainingSession['priority'] = 'recommended',
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
    lowerBodyDemand: discipline === 'run' || discipline === 'bike' || discipline === 'strength' ? 'moderate' : 'none',
    upperBodyDemand: discipline === 'swim' ? 'moderate' : 'none',
    impact: discipline === 'run' ? 'moderate' : 'none',
    technicalDemand: 'moderate',
    recoveryCost: hard ? 4 : 1,
    priority,
    source: 'manual',
    keySession: hard,
  };
}

const previousWeek: UnifiedTrainingSession[] = [
  session('swim-1', '2026-08-03', 'swim', 45),
  session('swim-2', '2026-08-05', 'swim', 45),
  session('bike-1', '2026-08-04', 'bike', 60),
  session('bike-2', '2026-08-06', 'bike', 90),
  session('run-1', '2026-08-03', 'run', 40),
  session('run-2', '2026-08-06', 'run', 45),
  session('strength-1', '2026-08-04', 'strength', 40),
  session('strength-2', '2026-08-07', 'strength', 40),
];

describe('whole-athlete weekly planner', () => {
  it('generates a balanced 70.3 week across swim, bike, run, and strength', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 600,
      goalType: 'ironman_70_3',
      phase: 'build',
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'moderate',
      },
    });

    for (const discipline of ['swim', 'bike', 'run', 'strength'] as const) {
      const summary = plan.disciplineSummary.find((item) => item.discipline === discipline);
      expect(summary?.sessions).toBeGreaterThanOrEqual(2);
    }
    expect(plan.plannedMinutes).toBeLessThanOrEqual(600);
    expect(plan.planningState).toBe('build');
    expect(plan.sessions.some((item) => item.planningCommitment === 'generated')).toBe(true);
  });

  it('holds progression and removes generated high intensity when energy-availability signals are concerning', () => {
    const previousMinutes = previousWeek.reduce((sum, item) => sum + item.durationMinutes, 0);
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 600,
      goalType: 'ironman_70_3',
      phase: 'build',
      previousWeek,
      health: {
        energyAvailability: 'concerning',
        menstrualRecovery: 'disrupted',
        mentalEnergy: 'good',
        lifeStress: 'moderate',
      },
    });

    expect(plan.planningState).toBe('protect');
    expect(plan.progressionAllowed).toBe(false);
    expect(plan.progressionBudget.primary).toBeNull();
    expect(plan.targetMinutes).toBeLessThanOrEqual(previousMinutes);
    expect(plan.sessions
      .filter((item) => item.planningCommitment === 'generated')
      .every((item) => item.intensity !== 'hard' && item.intensity !== 'max')).toBe(true);
  });

  it('keeps return-to-run sessions easy, short, and separated', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 600,
      goalType: 'ironman_70_3',
      phase: 'build',
      previousWeek,
      returnToRun: true,
      recentBoneStress: true,
      health: {
        energyAvailability: 'adequate',
        boneStress: 'recent',
        mentalEnergy: 'good',
        lifeStress: 'moderate',
      },
    });

    const runs = plan.sessions.filter((item) => item.discipline === 'run');
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs.every((item) => item.intensity === 'easy' && item.durationMinutes <= 30 && item.impact !== 'high')).toBe(true);
    const dates = runs.map((item) => Date.parse(`${item.date}T12:00:00Z`)).sort((a, b) => a - b);
    for (let index = 1; index < dates.length; index += 1) {
      expect((dates[index]! - dates[index - 1]!) / 86_400_000).toBeGreaterThanOrEqual(2);
    }
  });

  it('preserves a fixed conflicting session for review instead of silently deleting it', () => {
    const fixedRun = session('fixed-hard-run', '2026-08-12', 'run', 60, 'hard');
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 500,
      goalType: 'ironman_70_3',
      phase: 'build',
      fixedSessions: [fixedRun],
      health: {
        energyAvailability: 'adequate',
        boneStress: 'active',
        noImpact: true,
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    const preserved = plan.sessions.find((item) => item.id === fixedRun.id);
    expect(preserved?.planningCommitment).toBe('fixed');
    expect(preserved?.durationMinutes).toBe(60);
    expect(preserved?.intensity).toBe('hard');
    expect(plan.sessions.filter((item) => item.discipline === 'run')).toHaveLength(1);
    expect(plan.warnings.some((warning) => warning.includes('preserved for athlete review'))).toBe(true);
  });

  it('generates no extra training when the athlete explicitly requests rest', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 500,
      goalType: 'ironman_70_3',
      phase: 'build',
      fixedSessions: [session('fixed-swim', '2026-08-12', 'swim', 45)],
      preferredSessions: [session('preferred-bike', '2026-08-13', 'bike', 60)],
      health: {
        energyAvailability: 'adequate',
        athleteRequestedRest: true,
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    expect(plan.planningState).toBe('recover');
    expect(plan.sessions.filter((item) => item.planningCommitment === 'generated')).toHaveLength(0);
    expect(plan.sessions.some((item) => item.id === 'fixed-swim')).toBe(true);
    expect(plan.sessions.some((item) => item.id === 'preferred-bike')).toBe(false);
  });

  it('downshifts preferred high-intensity work when health signals impose a ceiling', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 500,
      goalType: 'ironman_70_3',
      phase: 'build',
      preferredSessions: [session('preferred-hard-bike', '2026-08-13', 'bike', 60, 'hard')],
      health: {
        energyAvailability: 'concerning',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    const preferred = plan.sessions.find((item) => item.id === 'preferred-hard-bike');
    expect(preferred?.planningCommitment).toBe('preferred');
    expect(preferred?.intensity).toBe('easy');
    expect(preferred?.healthAdjusted).toBe(true);
  });
});
