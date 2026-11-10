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

export async function publishRemoteExposure(
  event: RemoteTrainingExposure, rpc?: Rpc,
): Promise<void> {
  if (!event.eventId || event.eventId.length > 128
      || !event.workoutId || event.workoutId.length > 128
      || (event.sessionId?.length ?? 0) > 128
      || !Number.isFinite(event.minutes) || event.minutes <= 0
      || event.minutes > 1440 || !validDay(event.trainingDate)
      || !Number.isFinite(Date.parse(event.completedAt))) {
    throw new Error('Invalid remote training exposure; the record needs repair.');
  }
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

/** Strict, idempotent backfill of all available 48h local actuals.
 * Missing/corrupted history and any network error DENY new cloud starts.
 * No deleted or ignored import is silently made into a completed dose.
 */
export async function synchronizeRecordedTrainingExposure(
  userId: string, rpc?: Rpc,
): Promise<number> {
  if (!userId) throw new Error('Missing athlete for training synchronization.');
  await assertAuthenticatedAthlete(userId, rpc);
  const now = new Date();
  const from = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const [workouts, endurance] = await Promise.all([
    listWorkoutLedgerEntriesForGuardrails({
      from: from.toISOString(), to: now.toISOString(), limit: 501,
    }),
    listEnduranceActivitiesForGuardrails({
      from: from.toISOString(), to: now.toISOString(), limit: 501,
    }),
  ]);
  if (workouts.length >= 501 || endurance.length >= 501) {
    throw new Error('Training history exceeds the synchronized safety review limit.');
  }
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
  for (const event of events) {
    await assertAuthenticatedAthlete(userId, rpc);
    await publishRemoteExposure(event, rpc);
  }
  await assertAuthenticatedAthlete(userId, rpc);
  return events.length;
}

/** Remote timestamps are assigned when the submitted recovery is received.
 * Only call this from a NEW explicit user review, not a delayed import of an
 * old "stable" observation that could falsely clear a newer loading event.
 */
export async function publishRemoteRecovery(
  userId: string, date: string,
  observations: Partial<Record<TrainingRegion, RecoveryStatus>>,
  rpc?: Rpc,
): Promise<void> {
  await assertAuthenticatedAthlete(userId, rpc);
  if (!validDay(date)) throw new Error('Invalid remote recovery date.');
  const regions: TrainingRegion[] = ['general','achilles','upper_back'];
  const values = Object.fromEntries(regions.filter((region) => observations[region] !== undefined)
    .map((region) => [region, observations[region]]));
  if (!Object.keys(values).length
      || Object.values(values).some((value) =>
        !['stable','uncertain','worse','red_flag'].includes(String(value)))) {
    throw new Error('An explicit regional recovery report is required.');
  }
  const id = `recovery:${date}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2,10)}`;
  const result = await call(backend(rpc), 'publish_training_remote_recovery', {
    p_event_id: id, p_training_date: date, p_observations: values,
  });
  if (result !== true) throw new Error('Cloud regional recovery was not confirmed.');
  await assertAuthenticatedAthlete(userId, rpc);
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
