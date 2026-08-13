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

  it('uses Monday as the default recovery day when it is open', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 600,
      goalType: 'ironman_70_3',
      phase: 'build',
      preferredRestDayOffset: 0,
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'moderate',
      },
    });

    expect(plan.recoveryDayDate).toBe('2026-08-10');
    expect(
      plan.sessions.some(
        (item) =>
          item.date === '2026-08-10'
          && item.planningCommitment === 'generated',
      ),
    ).toBe(false);
  });

  it('keeps a low-cost fixed Monday commitment on the recovery anchor', () => {
    const masters = session(
      'masters-swim',
      '2026-08-10',
      'swim',
      60,
      'moderate',
      'required',
    );

    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 650,
      goalType: 'ironman_70_3',
      phase: 'build',
      fixedSessions: [masters],
      preferredRestDayOffset: 0,
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'moderate',
      },
    });

    expect(
      plan.sessions.find((item) => item.id === 'masters-swim')
        ?.planningCommitment,
    ).toBe('fixed');
    expect(plan.recoveryDayDate).toBe('2026-08-10');
    expect(
      plan.sessions.some(
        (item) =>
          item.date === '2026-08-10'
          && item.planningCommitment === 'generated',
      ),
    ).toBe(false);
  });

  it('never creates a generated same-discipline double day', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 650,
      goalType: 'ironman_70_3',
      phase: 'build',
      frequencyTargets: {
        swim: { min: 3, preferred: 4, max: 5 },
        bike: { min: 3, preferred: 3, max: 5 },
        run: { min: 2, preferred: 2, max: 5 },
        strength: { min: 2, preferred: 2, max: 3 },
      },
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'moderate',
      },
    });

    const generated = plan.sessions.filter((item) => item.planningCommitment === 'generated');
    for (const current of generated) {
      const sameDisciplineSameDay = plan.sessions.filter((item) => item.date === current.date && item.discipline === current.discipline);
      expect(sameDisciplineSameDay).toHaveLength(1);
    }
  });

  it('preserves an athlete-specified same-discipline double without teaching the generator to copy it', () => {
    const fixed = [
      session('am-swim', '2026-08-11', 'swim', 45),
      session('pm-swim', '2026-08-11', 'swim', 35),
    ];
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 650,
      goalType: 'ironman_70_3',
      phase: 'build',
      fixedSessions: fixed,
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'moderate',
      },
    });

    expect(plan.sessions.filter((item) => item.date === '2026-08-11' && item.discipline === 'swim')).toHaveLength(2);
    const summary = plan.doubleDays.find((item) => item.date === '2026-08-11');
    expect(summary?.athleteSpecified).toBe(true);
    expect(summary?.rationale).toContain('Athlete-specified');
    const generatedSwimOnThatDay = plan.sessions.some((item) => item.date === '2026-08-11' && item.discipline === 'swim' && item.planningCommitment === 'generated');
    expect(generatedSwimOnThatDay).toBe(false);
  });

  it('only creates cross-discipline generated doubles with an explicit rationale', () => {
    const fixedSessions = [0, 1, 2, 3, 4, 5, 6].map((offset) =>
      session(`fixed-swim-${offset}`, `2026-08-${String(10 + offset).padStart(2, '0')}`, 'swim', 25));
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 800,
      goalType: 'ironman_70_3',
      phase: 'build',
      fixedSessions,
      frequencyTargets: {
        swim: { min: 0, preferred: 0, max: 7 },
        bike: { min: 2, preferred: 2, max: 3 },
        run: { min: 2, preferred: 2, max: 3 },
        strength: { min: 0, preferred: 0, max: 2 },
      },
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'moderate',
      },
    });

    const generatedDoubles = plan.doubleDays.filter((item) => !item.athleteSpecified);
    expect(generatedDoubles.length).toBeGreaterThan(0);
    for (const double of generatedDoubles) {
      expect(new Set(double.disciplines).size).toBe(double.disciplines.length);
      expect(double.rationale).toContain('Intentional double day:');
    }
  });

  it('separates Build phase from a lower-volume availability decision', () => {
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 300,
      goalType: 'ironman_70_3',
      phase: 'build',
      previousWeek,
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'moderate',
      },
    });

    expect(plan.planningState).toBe('build');
    expect(plan.weekDecision).toBe('reduce');
    expect(plan.weekDecisionReason.toLowerCase()).toContain('available training time');
    expect(plan.weekDecisionReason.toLowerCase()).toContain('remains a build phase');
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
    expect(plan.weekDecision).toBe('reduce');
    expect(plan.weekDecisionReason.toLowerCase()).toContain('build phase');
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
    expect(plan.weekDecision).toBe('recover');
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
