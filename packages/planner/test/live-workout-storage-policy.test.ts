import { describe, expect, it } from 'vitest';
import {
  LEGACY_LIVE_WORKOUT_KEY,
  scopedLiveWorkoutStorageKey,
} from '../src/live-workout-storage-policy';

describe('athlete-scoped live workout persistence', () => {
  it('uses a unique key for each athlete', () => {
    const a = scopedLiveWorkoutStorageKey('athlete-A');
    const b = scopedLiveWorkoutStorageKey('athlete-B');
    expect(a).not.toBe(b);
    expect(a).not.toBe(LEGACY_LIVE_WORKOUT_KEY);
    expect(b).not.toBe(LEGACY_LIVE_WORKOUT_KEY);
  });
  it('preserves identities containing separators without key collisions', () => {
    expect(scopedLiveWorkoutStorageKey('x/a')).not.toBe(scopedLiveWorkoutStorageKey('x%2Fa'));
  });
  it('never silently falls back to an unscoped identity', () => {
    expect(() => scopedLiveWorkoutStorageKey('')).toThrow();
    expect(() => scopedLiveWorkoutStorageKey('  ')).toThrow();
  });
  it('does not expose an old checkpoint from another athlete in a shared store', () => {
    const store = new Map<string,string>();
    store.set(scopedLiveWorkoutStorageKey('athlete-A'), 'session A');
    store.set(LEGACY_LIVE_WORKOUT_KEY, 'unknown legacy owner');
    expect(store.get(scopedLiveWorkoutStorageKey('athlete-B'))).toBeUndefined();
  });
});
