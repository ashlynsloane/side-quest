import { describe, expect, it } from 'vitest';

import { applyApprovedFrequencySuppression } from '../src/frequency-suppression';
import type { UnifiedTrainingSession } from '../src/unified-training';
import { buildWholeAthleteWeek } from '../src/whole-athlete-week';

function bikeSession(id: string, date: string): UnifiedTrainingSession {
  return {
    id,
    date,
    title: 'Easy bike',
    discipline: 'bike',
    durationMinutes: 45,
    intensity: 'easy',
    cardiovascularDemand: 'low',
    musculoskeletalDemand: 'low',
    lowerBodyDemand: 'moderate',
    upperBodyDemand: 'none',
    impact: 'none',
    technicalDemand: 'moderate',
    recoveryCost: 1,
    priority: 'required',
    source: 'manual',
    keySession: false,
  };
}

describe('approved frequency suppression', () => {
  it('prevents an athlete-approved skipped session from being silently recreated', () => {
    const result = applyApprovedFrequencySuppression(
      {},
      { swim: 2, bike: 3, run: 3, strength: 2 },
      { bike: 1 },
    );

    expect(result.bike).toEqual({ min: 2, preferred: 2, max: 2 });
    expect(result.run).toBeUndefined();
  });

  it('treats a cross-sport replacement as removing one obligation from the original discipline', () => {
    const result = applyApprovedFrequencySuppression(
      { run: { min: 2, preferred: 2, max: 3 } },
      { swim: 2, bike: 3, run: 2 },
      { swim: 1 },
    );

    expect(result.swim).toEqual({ min: 1, preferred: 1, max: 1 });
    expect(result.run).toEqual({ min: 2, preferred: 2, max: 3 });
  });

  it('never produces a negative weekly target', () => {
    const result = applyApprovedFrequencySuppression(
      {},
      { run: 1 },
      { run: 3 },
    );

    expect(result.run).toEqual({ min: 0, preferred: 0, max: 0 });
  });

  it('flows the reduced target into the whole-athlete generator without backfilling the skipped ride', () => {
    const frequencyTargets = applyApprovedFrequencySuppression(
      {},
      { bike: 3 },
      { bike: 1 },
    );
    const plan = buildWholeAthleteWeek({
      weekStartDate: '2026-08-10',
      availableMinutes: 600,
      goalType: 'ironman_70_3',
      phase: 'build',
      fixedSessions: [bikeSession('kept-bike', '2026-08-11')],
      frequencyTargets,
      health: {
        energyAvailability: 'adequate',
        mentalEnergy: 'good',
        lifeStress: 'low',
      },
    });

    expect(plan.sessions.filter((session) => session.discipline === 'bike')).toHaveLength(2);
    expect(plan.disciplineSummary.find((summary) => summary.discipline === 'bike')?.targetPreferred).toBe(2);
  });
});
