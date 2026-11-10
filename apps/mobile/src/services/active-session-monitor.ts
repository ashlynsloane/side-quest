import type { ActiveSessionRecoveryDecision } from '@circuit/planner';

export interface ActiveSessionMonitorOptions {
  read(): Promise<ActiveSessionRecoveryDecision>;
  onPause(reasons: string[]): void;
  subscribeForeground(check: () => void): () => void;
  intervalMs?: number;
}

/**
 * Owns the running-screen safety rechecks. Reassesses immediately, when the
 * app enters foreground, and periodically. Never overlaps database reads,
 * ignores late results after unmount/account switch, and fails closed when
 * recovery data cannot be read.
 *
 * This checks local runtime state only, not other devices.
 */
export function createActiveSessionMonitor(options: ActiveSessionMonitorOptions) {
  let active = false;
  let inFlight = false;
  let pending = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  let generation = 0;
  let paused = false;

  const check = async () => {
    if (!active || paused) return;
    if (inFlight) { pending = true; return; }
    inFlight = true;
    const token = generation;
    try {
      const result = await options.read();
      if (active && !paused && token === generation && result.pause) {
        paused = true;
        options.onPause(result.reasons);
      }
    } catch {
      if (active && !paused && token === generation) {
        paused = true;
        options.onPause(['Recovery history could not be verified. Training is paused.']);
      }
    } finally {
      inFlight = false;
      if (pending && active && !paused && token === generation) {
        pending = false;
        void check();
      }
    }
  };
  return {
    check,
    start(): () => void {
      if (active) throw new Error('Active session monitor already started');
      active = true;
      paused = false;
      generation += 1;
      pending = false;
      void check();
      interval = setInterval(() => { void check(); }, options.intervalMs ?? 15_000);
      unsubscribe = options.subscribeForeground(() => { void check(); });
      return () => {
        active = false;
        generation += 1;
        pending = false;
        if (interval) clearInterval(interval);
        unsubscribe?.();
      };
    },
  };
}
