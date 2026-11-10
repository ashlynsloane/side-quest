import type { GeneratedWorkout } from '@circuit/domain';
import { affectedTrainingRegions, type TrainingRegion, type RecoveryStatus } from '@circuit/planner';
import {
  getLatestTrainingBlock,
  listEnduranceActivitiesForGuardrails,
  listWorkoutLedgerEntriesForGuardrails,
} from './database';
import { getStoredDailyTrainingCeiling } from './database';
import {
  acquireCloudWorkoutLease, cloudWorkoutLeasesEnabled,
  type CloudWorkoutLease, type WorkoutLeaseRpc,
} from './cloud-workout-coordination';
import { supabase } from './supabase';

export interface RemoteTrainingExposure {
  eventId: string;
  workoutId: string;
  sessionId: string | null;
  activity: 'strength' | 'run' | 'bike' | 'swim' | 'hiit';
  minutes: number;
  regions: TrainingRegion[];
  completedAt: string;
  trainingDate: string;
}

export interface RemoteTrainingRecovery {
  region: TrainingRegion;
  status: RecoveryStatus;
  observedAt: string;
}

export interface RemoteTrainingSnapshot {
  trainingDate: string;
  readAt: string;
  plan: Array<{
    sessionId: string;
    minutes: number;
    regions: TrainingRegion[];
  }> | null;
  exposures: RemoteTrainingExposure[];
  reservations: Array<{
    sessionId: string;
    workoutId: string;
    minutes: number;
    regions: TrainingRegion[];
    acquiredAt: string;
    trainingDate: string;
  }>;
  recovery: RemoteTrainingRecovery[];
}

/** Athlete correction requests are immutable proposals. Their effect on
 * authorization is ZERO until a privileged reviewer approves an amendment.
 * Stable request IDs must be persisted by the caller before an uncertain retry.
 */
export interface RemoteTrainingCorrectionRequest {
  requestId: string;
  targetType: 'exposure' | 'reservation';
  targetId: string;
  trainingDate: string;
  action: 'retract' | 'replace_minutes';
  correctedMinutes: number | null;
  reasonCode: 'duplicate' | 'import_error' | 'duration_error' | 'never_started' | 'other';
}
export interface RemoteTrainingCorrectionRecord extends RemoteTrainingCorrectionRequest {
  requestedAt: string;
  outcome: 'approved' | 'rejected' | null;
  reviewReference: string | null;
  decidedAt: string | null;
}

const correctionReasons = new Set<RemoteTrainingCorrectionRequest['reasonCode']>([
  'duplicate', 'import_error', 'duration_error', 'never_started', 'other',
]);

export async function requestRemoteTrainingCorrection(
  userId: string, request: RemoteTrainingCorrectionRequest, rpc?: WorkoutLeaseRpc,
): Promise<void> {
  await assertAuthenticatedAthlete(userId, rpc);
  if (!request.requestId || request.requestId.length > 128
      || !request.targetId || request.targetId.length > 128
      || !validDay(request.trainingDate)
      || !['exposure', 'reservation'].includes(request.targetType)
      || !['retract', 'replace_minutes'].includes(request.action)
      || !correctionReasons.has(request.reasonCode)
      || (request.action === 'retract' && request.correctedMinutes !== null)
      || (request.action === 'replace_minutes' && (
        request.targetType !== 'exposure' || request.correctedMinutes === null
        || !Number.isFinite(request.correctedMinutes)
        || request.correctedMinutes <= 0 || request.correctedMinutes > 1440
        || Math.round(request.correctedMinutes * 100) !== request.correctedMinutes * 100
      ))) {
    throw new Error('Invalid reviewed correction request.');
  }
  const result = await call(backend(rpc), 'request_training_remote_correction', {
    p_request_id: request.requestId,
    p_target_type: request.targetType,
    p_target_id: request.targetId,
    p_training_date: request.trainingDate,
    p_action: request.action,
    p_corrected_minutes: request.correctedMinutes,
    p_reason_code: request.reasonCode,
  });
  if (result !== true) throw new Error('Correction request was not confirmed.');
  await assertAuthenticatedAthlete(userId, rpc);
}

/** Only reports the server's review status. Never grants local clearance. */
export async function readRemoteTrainingCorrections(
  userId: string, rpc?: WorkoutLeaseRpc,
): Promise<RemoteTrainingCorrectionRecord[]> {
  await assertAuthenticatedAthlete(userId, rpc);
  const data = await call(backend(rpc), 'read_training_remote_corrections', {
    p_limit: 100,
  });
  if (!Array.isArray(data) || data.length > 100 || data.some((item: unknown) => {
    if (!item || typeof item !== 'object') return true;
    const row = item as Partial<RemoteTrainingCorrectionRecord>;
    return typeof row.requestId !== 'string' || !row.requestId
      || !['exposure', 'reservation'].includes(String(row.targetType))
      || !['retract', 'replace_minutes'].includes(String(row.action))
      || !validDay(String(row.trainingDate))
      || !['approved', 'rejected', null].includes(row.outcome ?? null);
  })) {
    throw new Error('The remote correction audit is unreadable.');
  }
  await assertAuthenticatedAthlete(userId, rpc);
  return data as RemoteTrainingCorrectionRecord[];
}

type Rpc = WorkoutLeaseRpc;
function backend(provided?: Rpc): Rpc {
  if (provided) return provided;
  if (!supabase) throw new Error('Synchronized training history requires authenticated cloud access.');
  return supabase as unknown as Rpc;
}
async function assertAuthenticatedAthlete(userId: string, provided?: Rpc): Promise<void> {
  if (!userId) throw new Error('Missing cloud athlete identity.');
  // Injected RPCs are reserved for deterministic unit and PostgreSQL-adapter
  // tests. Production always verifies the authenticated Supabase user.
  if (provided) return;
  if (!supabase) throw new Error('Synchronized training requires cloud authentication.');
  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== userId) {
    throw new Error('Signed-in cloud identity changed while synchronizing training. Start again.');
  }
}

async function call(rpc: Rpc, name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpc.rpc(name, args);
  if (error) throw new Error(`Synchronized training ledger rejected the update: ${error.message}`);
  return data;
}

function validDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day)
    && Number.isFinite(Date.parse(`${day}T12:00:00Z`));
}

export function trainingDay(now = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid training date.');
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function regionsFor(workout: GeneratedWorkout): TrainingRegion[] {
  const allowed = new Set<TrainingRegion>(['general', 'achilles', 'upper_back']);
  const inferred = affectedTrainingRegions(workout);
  return [...new Set<TrainingRegion>(['general', ...inferred.filter((region) => allowed.has(region))])];
}

export async function publishRemoteDailyPlan(
  userId: string, date: string, rpc?: Rpc,
): Promise<RemoteTrainingSnapshot['plan']> {
  if (!userId || !validDay(date)) throw new Error('Invalid athlete or training date.');
  await assertAuthenticatedAthlete(userId, rpc);
  const [saved, ceiling] = await Promise.all([
    getLatestTrainingBlock(), getStoredDailyTrainingCeiling(userId, date),
  ]);
  const planned = saved?.block.weeks.flatMap((week) => week.sessions)
    .filter((session) => session.date === date && session.completionStatus !== 'skipped') ?? [];
  if (!planned.length) throw new Error('Cloud training requires a scheduled daily prescription.');

  const sessions = planned.map((session) => {
    const constrained = ceiling?.planned.find((dose) => dose.sessionId === session.id);
    const minutes = Math.ceil(session.workout.estimatedElapsedSeconds / 60);
    const allowedMinutes = Math.min(minutes, constrained?.minutes ?? minutes);
    if (!Number.isFinite(allowedMinutes) || !Number.isInteger(allowedMinutes)
        || allowedMinutes < 1 || allowedMinutes > 720) {
      throw new Error('The current training prescription cannot be synchronized.');
    }
    return { sessionId: session.id, minutes: allowedMinutes,
      regions: regionsFor(session.workout) };
  });
  const unique = new Set(sessions.map((session) => session.sessionId));
  if (unique.size !== sessions.length) {
    throw new Error('Duplicate scheduled session IDs prevent synchronized authorization.');
  }
  const result = await call(backend(rpc), 'publish_training_remote_plan', {
    p_training_date: date, p_sessions: sessions,
  });
  if (result !== true) throw new Error('Remote prescription was not confirmed.');
  await assertAuthenticatedAthlete(userId, rpc);
  return sessions;
}

export function validateRemoteExposure(event: RemoteTrainingExposure): void {
  if (!event.eventId || event.eventId.length > 128
      || !event.workoutId || event.workoutId.length > 128
      || (event.sessionId?.length ?? 0) > 128
      || !Number.isFinite(event.minutes) || event.minutes <= 0
      || event.minutes > 1440 || !validDay(event.trainingDate)
      || !Number.isFinite(Date.parse(event.completedAt))) {
    throw new Error('Invalid remote training exposure; the record needs repair.');
  }
}

export async function publishRemoteExposure(
  event: RemoteTrainingExposure, rpc?: Rpc,
): Promise<void> {
  validateRemoteExposure(event);
  const response = await call(backend(rpc), 'publish_training_remote_exposure', {
    p_event_id: event.eventId,
    p_workout_id: event.workoutId,
    p_session_id: event.sessionId,
    p_activity: event.activity,
    p_minutes: event.minutes,
    p_regions: event.regions,
    p_completed_at: event.completedAt,
    p_training_date: event.trainingDate,
  });
  if (response !== true) throw new Error('Cloud training exposure was not confirmed.');
}

/**
 * Backfill up to 89 days of recorded workouts and endurance imports before a
 * remote authorization. The server rejects events older than 90 days.
 * Stable paginated reads prevent a dense history from silently truncating.
 * An exact remote event ID is immutable; corrected/deleted records therefore
 * require a reviewed amendment flow rather than optimistic overwrite.
 *
 * All uploads are bounded atomic batches, retried idempotently. The next
 * remote start is DENIED on incomplete data, bad history or any RPC error.
 */
export async function synchronizeRecordedTrainingExposure(
  userId: string, rpc?: Rpc,
): Promise<number> {
  if (!userId) throw new Error('Missing athlete for training synchronization.');
  await assertAuthenticatedAthlete(userId, rpc);
  const now = new Date();
  const from = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000);
  const pageSize = 200;
  const maxEntries = 5000;

  async function pages<T>(
    read: (offset: number) => Promise<T[]>,
  ): Promise<T[]> {
    const all: T[] = [];
    for (let offset = 0; offset <= maxEntries; offset += pageSize) {
      const page = await read(offset);
      if (!Array.isArray(page) || page.length > pageSize) {
        throw new Error('Historical training returned an invalid page.');
      }
      all.push(...page);
      if (all.length > maxEntries) {
        throw new Error('Historical training is too large for the bounded safe synchronization.');
      }
      if (page.length < pageSize) return all;
    }
    throw new Error('Historical training pagination could not finish safely.');
  }

  const [workouts, endurance] = await Promise.all([
    pages((offset) => listWorkoutLedgerEntriesForGuardrails({
      from: from.toISOString(), to: now.toISOString(), limit: pageSize, offset,
    })),
    pages((offset) => listEnduranceActivitiesForGuardrails({
      from: from.toISOString(), to: now.toISOString(), limit: pageSize, offset,
    })),
  ]);
  const events: RemoteTrainingExposure[] = workouts.map((entry): RemoteTrainingExposure => {
    const elapsed = entry.workout
      ? entry.workout.estimatedElapsedSeconds * entry.completionFraction / 60
      : (Date.parse(entry.completedAt) - Date.parse(entry.startedAt)) / 60_000;
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      throw new Error('Completed workout contains invalid recorded activity.');
    }
    return {
      eventId: `workout:${entry.id}`,
      workoutId: entry.workout?.id ?? entry.id,
      sessionId: entry.plannedSessionId ?? null,
      activity: 'strength' as const,
      minutes: Math.ceil(elapsed),
      regions: entry.workout ? regionsFor(entry.workout) : ['general','achilles','upper_back'] as TrainingRegion[],
      completedAt: entry.completedAt,
      trainingDate: trainingDay(new Date(entry.completedAt)),
    };
  }).filter((event) => event.minutes > 0);

  for (const entry of endurance) {
    if (entry.deletedAt || entry.classification === 'ignored') continue;
    if (!Number.isFinite(entry.movingTimeSeconds) || entry.movingTimeSeconds < 0) {
      throw new Error('Invalid imported training load.');
    }
    const minutes = Math.ceil(entry.movingTimeSeconds / 60);
    if (!minutes) continue;
    const regions: TrainingRegion[] = entry.discipline === 'run' || entry.discipline === 'bike'
      ? ['general','achilles']
      : entry.discipline === 'swim'
        ? ['general','upper_back']
        : ['general','achilles','upper_back'];
    events.push({
      eventId: `import:${entry.id}`, workoutId: entry.id, sessionId: null,
      activity: entry.discipline, minutes, regions,
      completedAt: entry.startAt, trainingDate: trainingDay(new Date(entry.startAt)),
    });
  }
  // Validate the whole collected history before ANY batch is written.
  // An invalid record is not interpreted as a missing workout.
  for (const event of events) validateRemoteExposure(event);
  const client = backend(rpc);
  for (let index = 0; index < events.length; index += 100) {
    await assertAuthenticatedAthlete(userId, rpc);
    const batch = events.slice(index, index + 100);
    const result = await call(client, 'publish_training_remote_exposure_batch', {
      p_events: batch,
    });
    if (result !== batch.length) {
      throw new Error('The synchronized exposure batch was not fully confirmed.');
    }
  }
  await assertAuthenticatedAthlete(userId, rpc);
  return events.length;
}

/** Remote timestamps are assigned when the submitted recovery is received.
 * Only call this from a NEW explicit user review, not a delayed import of an
 * old "stable" observation that could falsely clear a newer loading event.
 */
type PendingRecovery = {
  eventId: string;
  values: Partial<Record<TrainingRegion, RecoveryStatus>>;
};

function pendingRecoveryKey(userId: string, date: string): string {
  return `sidequest.pending-cloud-recovery.v1:${encodeURIComponent(userId)}:${date}`;
}

function recoveryStorage(): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
} {
  const storage = (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
  if (!storage) throw new Error('Durable recovery sync storage is unavailable.');
  return storage;
}

/** A failed network acknowledgement must retry the SAME recovery event ID,
 * preserving the server's original observation timestamp.
 */
export async function publishRemoteRecovery(
  userId: string, date: string,
  observations: Partial<Record<TrainingRegion, RecoveryStatus>>,
  rpc?: Rpc,
): Promise<string> {
  await assertAuthenticatedAthlete(userId, rpc);
  if (!validDay(date)) throw new Error('Invalid remote recovery date.');
  const regions: TrainingRegion[] = ['general','achilles','upper_back'];
  const values = Object.fromEntries(regions.filter((region) => observations[region] !== undefined)
    .map((region) => [region, observations[region]])) as PendingRecovery['values'];
  if (!Object.keys(values).length
      || Object.values(values).some((value) =>
        !['stable','uncertain','worse','red_flag'].includes(String(value)))) {
    throw new Error('An explicit regional recovery report is required.');
  }
  const storage = recoveryStorage();
  const key = pendingRecoveryKey(userId, date);
  let pending: PendingRecovery;
  const previous = storage.getItem(key);
  if (previous) {
    let parsed: unknown;
    try { parsed = JSON.parse(previous); } catch {
      throw new Error('Pending recovery upload is unreadable; review before retrying.');
    }
    const candidate = parsed as PendingRecovery | null;
    if (!candidate || typeof candidate.eventId !== 'string'
        || !candidate.eventId.startsWith(`recovery:${date}:`)
        || !candidate.values || typeof candidate.values !== 'object') {
      throw new Error('Pending recovery upload is invalid; review before retrying.');
    }
    if (JSON.stringify(candidate.values) !== JSON.stringify(values)) {
      throw new Error('Complete the pending recovery synchronization before changing symptoms.');
    }
    pending = candidate;
  } else {
    pending = {
      eventId: `recovery:${date}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`,
      values,
    };
    // Write-ahead journal: a crash after server acceptance must not generate
    // a fresh "stable" timestamp for an older observation on retry.
    storage.setItem(key, JSON.stringify(pending));
  }
  const result = await call(backend(rpc), 'publish_training_remote_recovery', {
    p_event_id: pending.eventId, p_training_date: date, p_observations: values,
  });
  if (result !== true) throw new Error('Cloud regional recovery was not confirmed.');
  await assertAuthenticatedAthlete(userId, rpc);
  return pending.eventId;
}

/** Acknowledge only after the matching local observation is also durable. */
export function acknowledgeRemoteRecovery(
  userId: string, date: string, eventId: string,
): void {
  const storage = recoveryStorage();
  const key = pendingRecoveryKey(userId, date);
  const raw = storage.getItem(key);
  if (!raw) throw new Error('Recovery sync acknowledgement has no pending event.');
  let pending: PendingRecovery;
  try { pending = JSON.parse(raw) as PendingRecovery; } catch {
    throw new Error('Recovery sync acknowledgement is unreadable.');
  }
  if (pending.eventId !== eventId) {
    throw new Error('Recovery sync acknowledgement does not match the pending event.');
  }
  storage.removeItem(key);
}

export async function readRemoteTrainingSnapshot(
  userId: string, date: string, rpc?: Rpc,
): Promise<RemoteTrainingSnapshot> {
  await assertAuthenticatedAthlete(userId, rpc);
  if (!validDay(date)) throw new Error('Invalid snapshot date.');
  const data = await call(backend(rpc), 'read_training_remote_snapshot', {
    p_training_date: date,
  });
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The synchronized training snapshot is unreadable.');
  }
  const snapshot = data as RemoteTrainingSnapshot;
  if (snapshot.trainingDate !== date || !Number.isFinite(Date.parse(snapshot.readAt))
      || !Array.isArray(snapshot.exposures) || !Array.isArray(snapshot.reservations)
      || !Array.isArray(snapshot.recovery)
      || !(snapshot.plan === null || Array.isArray(snapshot.plan))) {
    throw new Error('The synchronized training snapshot has invalid fields.');
  }
  await assertAuthenticatedAthlete(userId, rpc);
  return snapshot;
}

/** The cloud start boundary synchronizes local actuals first, then lets the
 * server atomically compare all devices' dose and recovery with today's
 * immutable prescription while acquiring the exclusive workout lease.
 */
export async function acquireSynchronizedWorkoutLease(
  userId: string, workout: GeneratedWorkout, sessionId?: string, rpc?: Rpc,
): Promise<CloudWorkoutLease> {
  if (!cloudWorkoutLeasesEnabled()) throw new Error('Remote training ledger is not enabled.');
  await assertAuthenticatedAthlete(userId, rpc);
  if (!sessionId) {
    throw new Error('Additional training requires a reviewed, synchronized prescription.');
  }
  const date = trainingDay();
  const sessions = await publishRemoteDailyPlan(userId, date, rpc);
  const matching = sessions?.find((session) => session.sessionId === sessionId);
  if (!matching) throw new Error('The synchronized prescription does not contain this session.');
  const minutes = Math.ceil(workout.estimatedElapsedSeconds / 60);
  const regions = regionsFor(workout);
  if (minutes > matching.minutes || regions.some((region) => !matching.regions.includes(region))) {
    throw new Error('The modified workout exceeds the synchronized prescribed dose.');
  }
  await synchronizeRecordedTrainingExposure(userId, rpc);
  await assertAuthenticatedAthlete(userId, rpc);
  return acquireCloudWorkoutLease(workout.id, rpc, {
    trainingDate: date, sessionId, minutes, regions,
  });
}
