import { describe, expect, it } from 'vitest';
import { evaluateWorkoutAuthorizationAge } from '../src/workout-authorization-expiry';

describe('live-session authorization age', () => {
  it('permits same-day recent authorizations', () => {
    expect(evaluateWorkoutAuthorizationAge('2026-11-09T10:00:00-07:00',
      new Date('2026-11-09T11:00:00-07:00')).current).toBe(true);
  });
  it('expires an eight-hour-old authorization', () => {
    expect(evaluateWorkoutAuthorizationAge('2026-11-09T08:00:00-07:00',
      new Date('2026-11-09T17:00:00-07:00')).current).toBe(false);
  });
  it('expires future, malformed and prior-day authorizations', () => {
    expect(evaluateWorkoutAuthorizationAge('bad date', new Date()).current).toBe(false);
    expect(evaluateWorkoutAuthorizationAge('2026-11-09T20:00:00-07:00',
      new Date('2026-11-09T19:00:00-07:00')).current).toBe(false);
    expect(evaluateWorkoutAuthorizationAge('2026-11-09T23:59:00Z',
      new Date('2026-11-10T00:01:00Z')).current).toBe(false);
  });
});
