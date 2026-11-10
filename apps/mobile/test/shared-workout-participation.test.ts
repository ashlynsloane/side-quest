import { describe, expect, it } from 'vitest';
import { authorizedSharedParticipationFraction } from '../src/services/shared-workout-participation';

const startsAt = '2026-11-10T18:00:00.000Z';
const start = Date.parse(startsAt);
function fraction(overrides: Partial<Parameters<typeof authorizedSharedParticipationFraction>[0]> = {}) {
  return authorizedSharedParticipationFraction({
    startsAt, workoutSeconds: 1200,
    firstVerifiedAt: start,
    lastVerifiedAt: start,
    leaseStatus: 'verified',
    now: start + 1200_000,
    ...overrides,
  });
}
describe('shared workout individual participation accounting', () => {
  it('counts the full authorized interval for a continuously verified athlete', () => {
    expect(fraction()).toBe(1);
  });
  it('never counts a global room clock before an athlete verified their lease', () => {
    expect(fraction({firstVerifiedAt: null})).toBe(0);
  });
  it('counts half when an athlete joins ten minutes into a twenty-minute room', () => {
    expect(fraction({firstVerifiedAt: start + 600_000})).toBe(0.5);
  });
  it('stops at the last confirmed interval when the lease is lost', () => {
    expect(fraction({
      leaseStatus: 'lost', lastVerifiedAt: start + 300_000,
      now: start + 1200_000,
    })).toBe(0.25);
  });
  it('never counts more than the prescribed room length', () => {
    expect(fraction({now: start + 5000_000})).toBe(1);
  });
  it('fails conservatively for bad timestamps and durations', () => {
    expect(fraction({startsAt: 'invalid'})).toBe(0);
    expect(fraction({workoutSeconds: 0})).toBe(0);
    expect(fraction({firstVerifiedAt: start + 1500_000})).toBe(0);
  });
});
