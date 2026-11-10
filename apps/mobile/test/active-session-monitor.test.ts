import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActiveSessionMonitor } from '../src/services/active-session-monitor';

const ok = { pause: false, reasons: [], affectedRegions: [] };
const bad = { pause: true, reasons: ['Achilles worsening'], affectedRegions: [] };
let foreground!: () => void;
let unsubscribe: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  unsubscribe = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
});
function create(read: () => Promise<typeof ok>) {
  const onPause = vi.fn();
  const monitor = createActiveSessionMonitor({
    read,
    onPause,
    subscribeForeground: (handler) => {
      foreground = handler;
      return unsubscribe;
    },
    intervalMs: 1000,
  });
  return { monitor, onPause };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('live workout interruption monitor', () => {
  it('reviews recovery immediately and periodically after mounting', async () => {
    const read = vi.fn(async () => ok);
    const { monitor } = create(read);
    const stop = monitor.start();
    await flush();
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(read).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('checks immediately on foreground and stops for new regional symptoms', async () => {
    let result = ok;
    const read = vi.fn(async () => result);
    const { monitor, onPause } = create(read);
    const stop = monitor.start();
    await flush();
    result = bad;
    foreground();
    await flush();
    expect(onPause).toHaveBeenCalledOnce();
    expect(onPause).toHaveBeenCalledWith(['Achilles worsening']);
    foreground();
    await vi.advanceTimersByTimeAsync(3000);
    expect(onPause).toHaveBeenCalledOnce();
    stop();
  });
  it('pauses on an unreadable recovery database instead of assuming clearance', async () => {
    const { monitor, onPause } = create(async () => {
      throw new Error('database locked');
    });
    monitor.start();
    await flush();
    expect(onPause).toHaveBeenCalledOnce();
    expect(onPause.mock.calls[0]?.[0][0]).toContain('could not be verified');
  });
  it('coalesces overlapping foreground and interval checks', async () => {
    let finish!: (value: typeof ok) => void;
    const read = vi.fn(() => new Promise<typeof ok>((resolve) => { finish = resolve; }));
    const { monitor } = create(read);
    const stop = monitor.start();
    foreground();
    await vi.advanceTimersByTimeAsync(3000);
    expect(read).toHaveBeenCalledTimes(1);
    finish(ok);
    await flush();
    expect(read).toHaveBeenCalledTimes(2);
    stop();
  });
  it('ignores late results from a screen that has already unmounted', async () => {
    let finish!: (value: typeof ok) => void;
    const { monitor, onPause } = create(() => new Promise((resolve) => { finish = resolve; }));
    const stop = monitor.start();
    stop();
    finish(bad);
    await flush();
    expect(onPause).not.toHaveBeenCalled();
  });
});
