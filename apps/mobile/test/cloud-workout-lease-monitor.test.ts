import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/supabase', () => ({ supabase: null }));
import {
  createCloudWorkoutLeaseMonitor, type CloudWorkoutLease,
} from '../src/services/cloud-workout-coordination';

const lease: CloudWorkoutLease = {
  leaseId: '00000000-0000-4000-8000-000000000001',
  deviceId: 'test-device',
  expiresAt: '2026-11-10T18:01:30.000Z',
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
let foreground!: () => void;
let unsubscribe: ReturnType<typeof vi.fn<() => void>>;
let onVerified: ReturnType<typeof vi.fn<(value: CloudWorkoutLease) => void>>;
let onLost: ReturnType<typeof vi.fn<(value: string) => void>>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-10T18:00:00.000Z'));
  unsubscribe = vi.fn(() => undefined);
  onVerified = vi.fn((_: CloudWorkoutLease) => undefined);
  onLost = vi.fn((_: string) => undefined);
});
afterEach(() => { vi.useRealTimers(); });

function setup(renew: (lease: CloudWorkoutLease) => Promise<CloudWorkoutLease>,
  persist: (lease: CloudWorkoutLease) => Promise<void> = async () => undefined) {
  const monitor = createCloudWorkoutLeaseMonitor({
    initialLease: lease, renew, persist, onVerified, onLost,
    intervalMs: 30_000,
    subscribeForeground: (check) => { foreground = check; return unsubscribe; },
  });
  return monitor;
}
const fresh = (value: CloudWorkoutLease): CloudWorkoutLease => ({
  ...value, expiresAt: new Date(Date.now() + 90_000).toISOString(),
});

describe('cloud lease renewal lifecycle', () => {
  it('requires a verified server renewal before marking the lock current', async () => {
    const renew = vi.fn(async (value: CloudWorkoutLease) => fresh(value));
    const persist = vi.fn(async () => undefined);
    const monitor = setup(renew, persist);
    const stop = monitor.start();
    await flush();
    expect(renew).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
    expect(onVerified).toHaveBeenCalledOnce();
    expect(onLost).not.toHaveBeenCalled();
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('renews on app foreground and periodically without overlapping requests', async () => {
    const renew = vi.fn(async (value: CloudWorkoutLease) => fresh(value));
    const monitor = setup(renew);
    const stop = monitor.start();
    await flush();
    foreground();
    await flush();
    expect(renew).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(renew).toHaveBeenCalledTimes(3);
    stop();
  });
  it('fails closed if renewal is denied or network fails', async () => {
    const monitor = setup(async () => { throw new Error('connection lost'); });
    monitor.start();
    await flush();
    expect(onLost).toHaveBeenCalledWith('connection lost');
    expect(monitor.isLost()).toBe(true);
    foreground();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onLost).toHaveBeenCalledOnce();
  });
  it('fails closed if checkpoint could not store the renewed token', async () => {
    const monitor = setup(async (value) => fresh(value), async () => {
      throw new Error('checkpoint write failed');
    });
    monitor.start();
    await flush();
    expect(onVerified).not.toHaveBeenCalled();
    expect(onLost).toHaveBeenCalledWith('checkpoint write failed');
  });
  it('refuses a renewal that changes the server lease owner token', async () => {
    const monitor = setup(async (value) => ({
      ...fresh(value), leaseId: '00000000-0000-4000-8000-000000000002',
    }));
    monitor.start();
    await flush();
    expect(onLost).toHaveBeenCalledOnce();
    expect(onVerified).not.toHaveBeenCalled();
  });
  it('rejects late renewal responses from an unmounted profile', async () => {
    let complete!: (value: CloudWorkoutLease) => void;
    const monitor = setup(() => new Promise((resolve) => { complete = resolve; }));
    const stop = monitor.start();
    stop();
    complete(fresh(lease));
    await flush();
    expect(onVerified).not.toHaveBeenCalled();
    expect(onLost).not.toHaveBeenCalled();
  });
  it('expires a lease while an in-flight renewal hangs', async () => {
    const monitor = setup(() => new Promise(() => undefined));
    monitor.start();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(monitor.isLost()).toBe(true);
    expect(onLost).toHaveBeenCalledOnce();
  });
});
