import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('../src/services/supabase', () => ({ supabase: null }));

import {
  clearSharedWorkoutCloudLease,
  loadSharedWorkoutCloudLease,
  storeSharedWorkoutCloudLease,
} from '../src/services/shared-workout-cloud-lease';
import type { CloudWorkoutLease } from '../src/services/cloud-workout-coordination';

let store: Map<string, string>;
const token = '00000000-0000-4000-8000-000000000001';
const lease = (): CloudWorkoutLease => ({
  leaseId: token,
  deviceId: 'synthetic-device',
  expiresAt: new Date(Date.now() + 90_000).toISOString(),
});
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  });
});

describe('shared workout server lease checkpoints', () => {
  it('separates room and athlete identities', () => {
    const original = lease();
    storeSharedWorkoutCloudLease('athlete-A', 'room-1', original);
    expect(loadSharedWorkoutCloudLease('athlete-A', 'room-1')).toEqual(original);
    expect(loadSharedWorkoutCloudLease('athlete-B', 'room-1')).toBeNull();
    expect(loadSharedWorkoutCloudLease('athlete-A', 'room-2')).toBeNull();
  });
  it('never replaces a room token with a different lease ID or device', () => {
    const original = lease();
    storeSharedWorkoutCloudLease('athlete-A', 'room-1', original);
    expect(() => storeSharedWorkoutCloudLease('athlete-A', 'room-1', {
      ...original, leaseId: '00000000-0000-4000-8000-000000000002',
    })).toThrow('Another shared workout lease');
    expect(loadSharedWorkoutCloudLease('athlete-A', 'room-1')).toEqual(original);
  });
  it('keeps the latest expiry when an older renewal returns late', () => {
    const original = lease();
    storeSharedWorkoutCloudLease('athlete-A', 'room-1', original);
    const newest = { ...original, expiresAt: new Date(Date.now() + 180_000).toISOString() };
    storeSharedWorkoutCloudLease('athlete-A', 'room-1', newest);
    storeSharedWorkoutCloudLease('athlete-A', 'room-1', original);
    expect(loadSharedWorkoutCloudLease('athlete-A', 'room-1')).toEqual(newest);
  });
  it('rejects malformed, unavailable, and expired lease records', () => {
    expect(() => storeSharedWorkoutCloudLease('athlete-A', 'room-1', {
      ...lease(), expiresAt: new Date(Date.now() - 1).toISOString(),
    })).toThrow('expired');
    const key = Array.from(store.keys())[0] ?? 'unused';
    storeSharedWorkoutCloudLease('athlete-A', 'room-1', lease());
    const [actualKey] = store.keys();
    store.set(actualKey!, '{invalid');
    expect(() => loadSharedWorkoutCloudLease('athlete-A', 'room-1')).toThrow('unreadable');
    vi.stubGlobal('localStorage', undefined);
    expect(() => loadSharedWorkoutCloudLease('athlete-A', 'room-1')).toThrow('unavailable');
    expect(key).toBe('unused');
  });
  it('clears the current athlete-and-room checkpoint without erasing a different room', async () => {
    storeSharedWorkoutCloudLease('athlete-A', 'room-1', lease());
    storeSharedWorkoutCloudLease('athlete-A', 'room-2', lease());
    await clearSharedWorkoutCloudLease('athlete-A', 'room-1');
    expect(loadSharedWorkoutCloudLease('athlete-A', 'room-1')).toBeNull();
    expect(loadSharedWorkoutCloudLease('athlete-A', 'room-2')).toBeTruthy();
  });
});
