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
    expect(result?.steps.reduce((sum, step) => sum + step.minutes, 0)).toBe(120);
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
    expect(result?.steps.map((step) => step.instruction).join(' ')).toContain('Do not convert this placeholder into continuous running');
    expect(result?.guardrails.join(' ')).toContain('active running/return-to-run policy');
  });

  it('refuses to fabricate endurance details for strength/recovery sessions', () => {
    expect(buildEndurancePrescription(session({ discipline: 'strength' }))).toBeNull();
    expect(buildEndurancePrescription(session({ discipline: 'recovery' }))).toBeNull();
  });
});
