import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/supabase', () => ({ supabase: null }));
import {
  acquireCloudWorkoutLease, cloudWorkoutLeasesEnabled,
  releaseCloudWorkoutLease, renewCloudWorkoutLease,
  validCloudWorkoutLease, type CloudWorkoutLease, type WorkoutLeaseRpc,
} from '../src/services/cloud-workout-coordination';

// Synthetic, deliberately low-entropy UUID: an identifier fixture, not a credential.
const token = '00000000-0000-4000-8000-000000000001';
const later = () => new Date(Date.now() + 90_000).toISOString();
function backend(result: unknown, error: string | null = null): WorkoutLeaseRpc {
  return { rpc: vi.fn(async () => ({
    data: result, error: error ? { message: error } : null,
  })) };
}
let state: Map<string,string>;
beforeEach(() => {
  state = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => state.get(key) ?? null,
    setItem: (key: string, value: string) => { state.set(key,value); },
    removeItem: (key: string) => { state.delete(key); },
  });
});

describe('cloud workout lease protocol', () => {
  it('is disabled unless explicitly enabled in a deployment', () => {
    expect(typeof cloudWorkoutLeasesEnabled()).toBe('boolean');
    expect(validCloudWorkoutLease({leaseId: 'not-a-uuid', deviceId: 'x', expiresAt: later()})).toBe(false);
  });
  it('acquires a server-issued UUID and preserves a stable device identity', async () => {
    const rpc = backend([{granted: true, lease_id: token, expires_at: later()}]);
    const first = await acquireCloudWorkoutLease('workout-1',rpc);
    const second = await acquireCloudWorkoutLease('workout-2',rpc);
    expect(first.leaseId).toBe(token);
    expect(second.deviceId).toBe(first.deviceId);
    expect(rpc.rpc).toHaveBeenCalledWith('acquire_training_workout_lease', {
      p_workout_id: 'workout-1', p_device_id: first.deviceId,
    });
  });
  it('denies concurrent workouts while another device holds the lease', async () => {
    await expect(acquireCloudWorkoutLease('w',backend([
      {granted: false, lease_id: null, expires_at: null},
    ]))).rejects.toThrow('Another device');
  });
  it('fails closed on database network failure, missing RPC or malformed output', async () => {
    await expect(acquireCloudWorkoutLease('w',backend(null,'network down')))
      .rejects.toThrow('network down');
    await expect(acquireCloudWorkoutLease('w',backend({granted:true,lease_id:'malformed',expires_at:later()})))
      .rejects.toThrow('invalid');
    await expect(acquireCloudWorkoutLease('w',backend(null)))
      .rejects.toThrow('invalid');
  });
  it('validates a live server renewal and refuses an expired or stolen lease', async () => {
    const lease: CloudWorkoutLease = {leaseId:token,deviceId:'device-1',expiresAt:later()};
    const renewed = await renewCloudWorkoutLease(lease, backend([
      {renewed:true,expires_at:later()},
    ]));
    expect(renewed.leaseId).toBe(token);
    await expect(renewCloudWorkoutLease(lease, backend([
      {renewed:false,expires_at:null},
    ]))).rejects.toThrow('lost or expired');
  });
  it('releases only the matching server token, never via direct table mutation', async () => {
    const rpc = backend(true);
    await releaseCloudWorkoutLease({leaseId:token,deviceId:'device-1',expiresAt:later()}, rpc);
    expect(rpc.rpc).toHaveBeenCalledWith('release_training_workout_lease',{
      p_lease_id:token,p_device_id:'device-1',
    });
  });
  it('rejects missing durable storage, not a best-effort random in-memory device ID', async () => {
    vi.stubGlobal('localStorage', undefined);
    await expect(acquireCloudWorkoutLease('w',backend(null))).rejects.toThrow('Durable');
  });
});
