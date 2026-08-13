import { describe, expect, it } from 'vitest';
import type { WholeAthletePlannedSession } from '../src/whole-athlete-week';
import { coordinateWeeklyStrengthStimuli } from '../src/whole-athlete-strength-coherence';

function session(
  id: string,
  date: string,
  discipline: WholeAthletePlannedSession['discipline'],
  overrides: Partial<WholeAthletePlannedSession> = {},
): WholeAthletePlannedSession {
  return {
    id,
    date,
    title: id,
    discipline,
    durationMinutes: 45,
    intensity: 'moderate',
    priority: 'recommended',
    source: 'side_quest',
    cardiovascularDemand: 'moderate',
    musculoskeletalDemand: 'moderate',
    lowerBodyDemand: discipline === 'bike' || discipline === 'run' ? 'moderate' : 'none',
    upperBodyDemand: discipline === 'swim' ? 'moderate' : 'none',
    impact: discipline === 'run' ? 'moderate' : 'none',
    technicalDemand: 'moderate',
    recoveryCost: 2,
    keySession: false,
    planningCommitment: 'generated',
    rationale: [],
    healthAdjusted: false,
    ...overrides,
  };
}

describe('whole-athlete strength coherence', () => {
  it('de-emphasizes heavy lower-body strength beside a key run', () => {
    const result = coordinateWeeklyStrengthStimuli([
      session('run-quality', '2026-08-19', 'run', { intensity: 'hard', keySession: true, lowerBodyDemand: 'high', recoveryCost: 5 }),
      session('strength-a', '2026-08-20', 'strength', { lowerBodyDemand: 'moderate' }),
    ]);
    const strength = result.find((item) => item.id === 'strength-a');
    expect(strength?.strengthPrescription?.lowerBodyDose).toBe('light');
    expect(strength?.strengthPrescription?.deEmphasize).toContain('heavy_lower');
    expect(strength?.strengthPrescription?.deEmphasize).toContain('lower_leg_capacity');
  });

  it('allows the high-value heavy strength stimulus away from key bike/run load', () => {
    const result = coordinateWeeklyStrengthStimuli([
      session('strength-a', '2026-08-17', 'strength', { intensity: 'hard', keySession: true, progressionTarget: 'strength_intensity' }),
      session('bike-quality', '2026-08-20', 'bike', { intensity: 'hard', keySession: true, lowerBodyDemand: 'high' }),
    ]);
    const strength = result.find((item) => item.id === 'strength-a');
    expect(strength?.strengthPrescription?.emphasis).toContain('heavy_lower');
    expect(strength?.strengthPrescription?.lowerBodyDose).toBe('high');
    expect(strength?.strengthPrescription?.gymValue).toBe('high');
  });

  it('reduces redundant pulling beside a demanding swim', () => {
    const result = coordinateWeeklyStrengthStimuli([
      session('swim-quality', '2026-08-18', 'swim', { intensity: 'hard', keySession: true, upperBodyDemand: 'high', recoveryCost: 4 }),
      session('strength-a', '2026-08-18', 'strength'),
    ]);
    const strength = result.find((item) => item.id === 'strength-a');
    expect(strength?.strengthPrescription?.deEmphasize).toContain('upper_pull');
    expect(strength?.strengthPrescription?.emphasis).not.toContain('upper_pull');
  });

  it('distributes emphasis across multiple weekly strength sessions', () => {
    const result = coordinateWeeklyStrengthStimuli([
      session('strength-a', '2026-08-17', 'strength'),
      session('strength-b', '2026-08-20', 'strength'),
      session('strength-c', '2026-08-22', 'strength'),
    ]).filter((item) => item.discipline === 'strength');

    const first = result[0].strengthPrescription?.emphasis ?? [];
    const second = result[1].strengthPrescription?.emphasis ?? [];
    expect(second).not.toEqual(first);
    expect(new Set(result.flatMap((item) => item.strengthPrescription?.emphasis ?? [])).size).toBeGreaterThan(3);
  });
});
