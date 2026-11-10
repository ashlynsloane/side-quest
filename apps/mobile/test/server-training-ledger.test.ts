import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedWorkout } from '@circuit/domain';

vi.mock('../src/services/supabase', () => ({ supabase: null }));
const db = vi.hoisted(() => ({
  getLatestTrainingBlock: vi.fn(),
  getStoredDailyTrainingCeiling: vi.fn(),
  listWorkoutLedgerEntriesForGuardrails: vi.fn(),
  listEnduranceActivitiesForGuardrails: vi.fn(),
}));

vi.mock('../src/services/database', () => db);

import {
  acquireSynchronizedWorkoutLease, publishRemoteDailyPlan,
  publishRemoteExposure, publishRemoteRecovery, readRemoteTrainingSnapshot,
  synchronizeRecordedTrainingExposure,
} from '../src/services/server-training-ledger';
import type { WorkoutLeaseRpc } from '../src/services/cloud-workout-coordination';

const now = '2026-11-10T19:00:00.000Z';
const date = '2026-11-10';
const workout = {
  id: 'core-1', estimatedElapsedSeconds: 1200, name: 'Strength',
  targetRegions: ['core_anterior'],
  stations: [{ id: 'station-1', durationSeconds: 1200, exercises: [
    { exerciseSnapshot: {
      bodyRegions: [{ region: 'core_anterior', load: 1 }],
      jointLoads: [], movementPatterns: [],
      impactLevel: 0, cardiovascularDemand: 0,
    } },
  ] }],
} as unknown as GeneratedWorkout;

function rpc(responses: Record<string, unknown> = {}): WorkoutLeaseRpc {
  return {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => ({
      error: null,
      data: name in responses ? responses[name]
        : name === 'publish_training_remote_exposure_batch'
          ? (args.p_events as unknown[]).length : true,
    })),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  process.env.EXPO_PUBLIC_DISTRIBUTED_WORKOUT_LOCKS = 'true';
  vi.resetAllMocks();
  db.getLatestTrainingBlock.mockResolvedValue({ block: { weeks: [{
    sessions: [{
      id: 'session-1', date, completionStatus: 'planned',
      workout,
    }],
  }] } });
  db.getStoredDailyTrainingCeiling.mockResolvedValue(null);
  db.listWorkoutLedgerEntriesForGuardrails.mockResolvedValue([]);
  db.listEnduranceActivitiesForGuardrails.mockResolvedValue([]);
  vi.stubGlobal('localStorage', {
    getItem: () => null, setItem: () => undefined, removeItem: () => undefined,
  });
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.EXPO_PUBLIC_DISTRIBUTED_WORKOUT_LOCKS;
  vi.unstubAllGlobals();
});

describe('synchronized authoritative ledger mobile protocol', () => {
  it('publishes an exact immutable plan derived from a real scheduled session', async () => {
    const backend = rpc();
    const sessions = await publishRemoteDailyPlan('athlete-1', date, backend);
    expect(sessions).toEqual([{
      sessionId: 'session-1', minutes: 20, regions: ['general'],
    }]);
    expect(backend.rpc).toHaveBeenCalledWith('publish_training_remote_plan',
      { p_training_date: date, p_sessions: sessions });
  });

  it('does not generate a remote authorization from an unplanned or missing day', async () => {
    const backend = rpc();
    await expect(acquireSynchronizedWorkoutLease('athlete-1', workout, undefined, backend))
      .rejects.toThrow('synchronized prescription');
    expect(backend.rpc).not.toHaveBeenCalled();
    db.getLatestTrainingBlock.mockResolvedValue(null);
    await expect(publishRemoteDailyPlan('athlete-1', date, backend))
      .rejects.toThrow('scheduled daily prescription');
  });

  it('uploads validated completed and imported dose with stable deduplication IDs', async () => {
    db.listWorkoutLedgerEntriesForGuardrails.mockResolvedValue([{
      id: 'actual-1', workout,
      completedAt: '2026-11-10T18:40:00.000Z',
      startedAt: '2026-11-10T18:20:00.000Z',
      completionFraction: 1, updatedAt: now,
      plannedSessionId: 'session-1',
    }]);
    db.listEnduranceActivitiesForGuardrails.mockResolvedValue([{
      id: 'ride-1', discipline: 'bike', startAt: '2026-11-09T20:00:00.000Z',
      movingTimeSeconds: 1800, classification: 'conditioning',
    }]);
    const backend = rpc();
    expect(await synchronizeRecordedTrainingExposure('athlete-1', backend)).toBe(2);
    expect(backend.rpc).toHaveBeenCalledWith('publish_training_remote_exposure_batch',
      { p_events: expect.arrayContaining([
        expect.objectContaining({
          eventId: 'workout:actual-1', activity: 'strength',
          minutes: 20, sessionId: 'session-1',
        }),
        expect.objectContaining({
          eventId: 'import:ride-1', activity: 'bike',
          minutes: 30, regions: ['general', 'achilles'],
        }),
      ]) });
  });

  it('denies the next cloud session if any pending local exposure could not be synchronized', async () => {
    db.listWorkoutLedgerEntriesForGuardrails.mockResolvedValue([{
      id: 'completed', workout,
      completedAt: '2026-11-10T18:40:00.000Z',
      startedAt: '2026-11-10T18:20:00.000Z',
      completionFraction: 1,
    }]);
    const backend = {
      rpc: vi.fn(async (name: string) => ({
        data: name === 'publish_training_remote_plan' ? true : null,
        error: name === 'publish_training_remote_exposure_batch'
          ? { message: 'network down' } : null,
      })),
    };
    await expect(acquireSynchronizedWorkoutLease(
      'athlete-1', workout, 'session-1', backend,
    )).rejects.toThrow('network down');
    expect(backend.rpc).not.toHaveBeenCalledWith(
      'acquire_training_workout_lease_v2', expect.anything(),
    );
  });

  it('acquires an atomic server decision only after plan and historical upload', async () => {
    const backend = rpc({
      acquire_training_workout_lease_v2: [{
        granted: true,
        lease_id: '00000000-0000-4000-8000-000000000001',
        expires_at: new Date(Date.now() + 90_000).toISOString(),
      }],
    });
    const result = await acquireSynchronizedWorkoutLease(
      'athlete-1', workout, 'session-1', backend,
    );
    expect(result.leaseId).toMatch(/^00000000-/);
    expect(backend.rpc).toHaveBeenCalledWith('acquire_training_workout_lease_v2',
      expect.objectContaining({
        p_training_date: date,
        p_session_id: 'session-1',
        p_planned_minutes: 20,
      }));
  });

  it('uses an explicit remote recovery RPC rather than stale local timestamps', async () => {
    const backend = rpc();
    await publishRemoteRecovery('athlete-1', date, { achilles: 'worse' }, backend);
    expect(backend.rpc).toHaveBeenCalledWith('publish_training_remote_recovery',
      expect.objectContaining({
        p_training_date: date,
        p_observations: { achilles: 'worse' },
      }));
  });

  it('rejects malformed remote snapshot instead of treating it as no exposure', async () => {
    const backend = rpc({ read_training_remote_snapshot: null });
    await expect(readRemoteTrainingSnapshot('athlete-1', date, backend))
      .rejects.toThrow('unreadable');
  });

  it('rejects invalid or zero-dose cloud exposure', async () => {
    const backend = rpc();
    await expect(publishRemoteExposure({
      eventId: 'workout:empty', workoutId: 'w', sessionId: 'session-1',
      activity: 'strength', minutes: 0, regions: ['general'],
      completedAt: now, trainingDate: date,
    }, backend)).rejects.toThrow('Invalid remote');
    expect(backend.rpc).not.toHaveBeenCalled();
  });
  it('backfills an older saved workout outside the former 48-hour sync window', async () => {
    db.listWorkoutLedgerEntriesForGuardrails.mockResolvedValue([{
      id: 'old-workout', workout,
      completedAt: '2026-10-01T18:40:00.000Z',
      startedAt: '2026-10-01T18:20:00.000Z',
      completionFraction: 1,
      updatedAt: '2026-10-01T18:41:00.000Z',
      plannedSessionId: 'old-session',
    }]);
    const client = rpc();
    expect(await synchronizeRecordedTrainingExposure('athlete-1', client)).toBe(1);
    expect(db.listWorkoutLedgerEntriesForGuardrails).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200, offset: 0 }),
    );
    expect(client.rpc).toHaveBeenCalledWith('publish_training_remote_exposure_batch',
      expect.objectContaining({ p_events: [
        expect.objectContaining({ eventId: 'workout:old-workout',
          trainingDate: '2026-10-01' }),
      ] }),
    );
  });

  it('paginates a large local history and uploads bounded atomic batches', async () => {
    const start = Date.parse('2026-11-01T18:00:00.000Z');
    const rows = Array.from({ length: 215 }, (_, index) => ({
      id: `session-${index}`,
      workout,
      startedAt: new Date(start + index * 60_000).toISOString(),
      completedAt: new Date(start + index * 60_000 + 60_000).toISOString(),
      updatedAt: now,
      completionFraction: 1,
    }));
    db.listWorkoutLedgerEntriesForGuardrails.mockImplementation(async (
      params: {offset:number;limit:number},
    ) => rows.slice(params.offset, params.offset + params.limit));
    const client = rpc();
    expect(await synchronizeRecordedTrainingExposure('athlete-1', client)).toBe(215);
    expect(db.listWorkoutLedgerEntriesForGuardrails).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(client.rpc).mock.calls.filter(
      ([name]) => name === 'publish_training_remote_exposure_batch',
    );
    expect(calls.map(([, args]) => (args.p_events as unknown[]).length)).toEqual([100,100,15]);
  });

  it('fails closed on a partial batch acknowledgement', async () => {
    db.listWorkoutLedgerEntriesForGuardrails.mockResolvedValue([{
      id: 'one', workout, startedAt: now, completedAt: now,
      updatedAt: now, completionFraction: 1,
    }]);
    const client = rpc({ publish_training_remote_exposure_batch: 0 });
    await expect(acquireSynchronizedWorkoutLease(
      'athlete-1', workout, 'session-1', client,
    )).rejects.toThrow('not fully confirmed');
    expect(client.rpc).not.toHaveBeenCalledWith(
      'acquire_training_workout_lease_v2', expect.anything(),
    );
  });

});
