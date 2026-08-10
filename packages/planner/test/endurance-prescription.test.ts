import { describe, expect, it } from 'vitest';
import { buildEndurancePrescription } from '../src/endurance-prescription';
import type { PlannedMultisportSession } from '../src/multisport';

function session(values: Partial<PlannedMultisportSession> = {}): PlannedMultisportSession {
  return {
    id: 'bike-1',
    date: '2026-08-15',
    day: 'saturday',
    discipline: 'bike',
    title: 'Bike · long aerobic endurance',
    durationMinutes: 120,
    intensity: 'moderate',
    priority: 'key',
    ownership: 'generated',
    rationale: ['Placed on Saturday because it is the protected long-session slot.'],
    ...values,
  };
}

describe('endurance prescription', () => {
  it('materializes a complete inspectable bike prescription', () => {
    const result = buildEndurancePrescription(session());
    expect(result?.prescriptionVersion).toBe(1);
    expect(result?.workoutType).toBe('bike_long_aerobic');
    expect(result?.steps.reduce((sum, step) => sum + step.minutes, 0)).toBe(120);
    expect(result?.blocks.reduce((sum, block) => sum + block.totalMinutes, 0)).toBe(120);
    expect(result?.objective).toBe('Aerobic durability');
    expect(result?.whyThisSession).toContain('Placed on Saturday because it is the protected long-session slot.');
  });

  it('uses effort ranges instead of inventing athlete-specific power or pace thresholds', () => {
    const result = buildEndurancePrescription(session());
    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).toContain('rpe');
    expect(serialized).not.toContain('ftp');
    expect(serialized).not.toContain('watts');
    expect(serialized).not.toContain('min/mile');
  });

  it('turns a quality bike session into repeatable work and recovery blocks', () => {
    const result = buildEndurancePrescription(session({
      id: 'bike-quality',
      title: 'Bike · quality intervals',
      durationMinutes: 60,
      intensity: 'hard',
    }));
    const main = result?.blocks.find((block) => block.id === 'main');
    expect(result?.workoutType).toBe('bike_quality_intervals');
    expect(main?.kind).toBe('intervals');
    expect(main?.repeats).toBeGreaterThanOrEqual(2);
    expect(main?.workMinutes).toBeGreaterThanOrEqual(2);
    expect(main?.recoveryMinutes).toBeGreaterThanOrEqual(1);
    expect(result?.blocks.reduce((sum, block) => sum + block.totalMinutes, 0)).toBe(60);
  });

  it('gives technique swims a dedicated drill block instead of generic aerobic prose', () => {
    const result = buildEndurancePrescription(session({
      id: 'swim-technique',
      discipline: 'swim',
      title: 'Swim · aerobic technique',
      durationMinutes: 60,
      intensity: 'easy',
      priority: 'support',
    }));
    expect(result?.workoutType).toBe('swim_technique');
    expect(result?.blocks.some((block) => block.kind === 'drill')).toBe(true);
    expect(result?.blocks.reduce((sum, block) => sum + block.totalMinutes, 0)).toBe(60);
  });

  it('turns a run quality session into controlled intervals with easy recovery', () => {
    const result = buildEndurancePrescription(session({
      id: 'run-quality',
      discipline: 'run',
      title: 'Run · quality intervals',
      durationMinutes: 50,
      intensity: 'hard',
      priority: 'key',
    }));
    const main = result?.blocks.find((block) => block.id === 'main');
    expect(result?.workoutType).toBe('run_quality_intervals');
    expect(main?.kind).toBe('intervals');
    expect(main?.repeats).toBeGreaterThanOrEqual(2);
    expect(main?.target.high).toBeLessThanOrEqual(8);
    expect(result?.blocks.reduce((sum, block) => sum + block.totalMinutes, 0)).toBe(50);
  });

  it('does not tell a return-to-run athlete to extend a protocol placeholder', () => {
    const result = buildEndurancePrescription(session({
      id: 'run-1',
      discipline: 'run',
      day: 'wednesday',
      title: 'Run · return-to-run progression',
      durationMinutes: 20,
      intensity: 'easy',
      priority: 'support',
    }));
    expect(result?.workoutType).toBe('run_return_to_run');
    expect(result?.blocks.some((block) => block.kind === 'walk_run')).toBe(true);
    expect(result?.steps.map((step) => step.instruction).join(' ')).toContain('do not convert it into continuous running');
    expect(result?.guardrails.join(' ')).toContain('active running/return-to-run policy');
  });

  it('refuses to fabricate endurance details for strength/recovery sessions', () => {
    expect(buildEndurancePrescription(session({ discipline: 'strength' }))).toBeNull();
    expect(buildEndurancePrescription(session({ discipline: 'recovery' }))).toBeNull();
  });
});
