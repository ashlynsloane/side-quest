import { describe, expect, it } from 'vitest';
import type { ProtectedRecurringCommitment } from '@circuit/domain';
import { evaluateScheduleProtection } from '../src/protected-commitments';

const masters: ProtectedRecurringCommitment = {
  commitmentId: 'masters-swim', athleteId: 'athlete', title: 'Masters swimming', sport: 'swim',
  weekdays: [2, 4], localStartTime: '07:00', durationMinutes: 60, timezone: 'America/Denver',
  effectiveFrom: '2026-08-01', immovable: true, source: 'athlete', provenance: ['athlete'],
};

describe('protected recurring commitments', () => {
  it('blocks a bike ride that overlaps Tuesday masters swimming', () => {
    const result = evaluateScheduleProtection({ placementId: 'ride', title: 'Bike', localDate: '2026-08-04', localStartTime: '07:15', durationMinutes: 90, timezone: 'America/Denver' }, [masters]);
    expect(result.allowed).toBe(false);
    expect(result.requiresAthleteOverride).toBe(true);
  });

  it('allows a ride after the protected swim', () => {
    const result = evaluateScheduleProtection({ placementId: 'ride', title: 'Bike', localDate: '2026-08-04', localStartTime: '08:15', durationMinutes: 90, timezone: 'America/Denver' }, [masters]);
    expect(result.allowed).toBe(true);
  });
});
