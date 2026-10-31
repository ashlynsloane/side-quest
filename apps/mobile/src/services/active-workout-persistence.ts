import 'expo-sqlite/localStorage/install';

import type {
  ActiveWorkoutCheckpoint,
  ActiveWorkoutPersistenceWrite,
  ActiveWorkoutRestoreResult,
  GeneratedWorkout,
} from '@circuit/domain';
import { buildActiveWorkoutPersistenceWrite, restoreActiveWorkoutCheckpoint } from '@circuit/planner';


export const ACTIVE_WORKOUT_INDEX_KEY = 'sidequest.active-workout.current';

export interface ActiveWorkoutStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export async function persistActiveWorkout(storage: ActiveWorkoutStorageAdapter, checkpoint: ActiveWorkoutCheckpoint): Promise<ActiveWorkoutPersistenceWrite> {
  const write = buildActiveWorkoutPersistenceWrite(checkpoint);
  await storage.setItem(write.storageKey, write.serializedCheckpoint);
  await storage.setItem(ACTIVE_WORKOUT_INDEX_KEY, write.storageKey);
  return write;
}

export async function recoverActiveWorkout(storage: ActiveWorkoutStorageAdapter): Promise<ActiveWorkoutRestoreResult | null> {
  const storageKey = await storage.getItem(ACTIVE_WORKOUT_INDEX_KEY);
  if (!storageKey) return null;
  const serialized = await storage.getItem(storageKey);
  if (!serialized) { await storage.removeItem(ACTIVE_WORKOUT_INDEX_KEY); return null; }
  return restoreActiveWorkoutCheckpoint(serialized);
}

export async function clearPersistedActiveWorkout(storage: ActiveWorkoutStorageAdapter, workoutId: string): Promise<void> {
  await storage.removeItem(`sidequest.active-workout.${workoutId}`);
  const current = await storage.getItem(ACTIVE_WORKOUT_INDEX_KEY);
  if (current === `sidequest.active-workout.${workoutId}`) await storage.removeItem(ACTIVE_WORKOUT_INDEX_KEY);
}

// Live mobile adapter. The planner checkpoint remains available for domain-level flows;
// this snapshot also preserves timer and rest-entry UI state needed by the routed workout screen.
export type LiveWorkoutPhase = 'work' | 'rest';
export interface ActiveWorkoutPlanLink {
  sessionId: string;
  sessionDate: string;
  sessionTitle: string;
  modifiedFromPlan: boolean;
}
export type LiveWorkoutLoadValue = { value: number; unit: 'lb' | 'kg'; name: string };
export type LiveWorkoutRestEntry = { reps: string; load: string; unit: 'lb' | 'kg'; skipped: boolean };
export type LiveWorkoutLoadBasis = 'each_hand' | 'single_implement' | 'total' | 'bodyweight' | 'assisted' | 'band_level' | 'not_recorded';
export interface LiveWorkoutLoggedSet {
  id: string;
  reps?: number;
  seconds?: number;
  loadValue?: number;
  loadUnit?: 'lb' | 'kg';
  loadBasis: LiveWorkoutLoadBasis;
  effort?: number;
  completed: boolean;
}

export interface LiveWorkoutSessionSnapshot {
  schemaVersion: 1;
  savedAt: string;
  workout: GeneratedWorkout;
  startedAt: string;
  stationIndex: number;
  phase: LiveWorkoutPhase;
  remainingSeconds: number;
  running: boolean;
  stationRounds: Record<string, number>;
  exerciseLoads: Record<string, LiveWorkoutLoadValue>;
  exerciseSets: Record<string, LiveWorkoutLoggedSet[]>;
  restEntries: Record<string, LiveWorkoutRestEntry>;
  restRounds: number;
  restLoadUnit: 'lb' | 'kg';
  planLink?: ActiveWorkoutPlanLink;
  /** Durable retry intent; cannot silently become a full completion after restart. */
  pendingCompletion?: { completionFraction: number; completedAt: string };
}

const LIVE_SESSION_KEY = 'sidequest.live-workout.session.v1';
export const ACTIVE_WORKOUT_PROFILE_KEY = 'sidequest.active-workout.profile-id';
const ORIGINAL_DATABASE_OWNER_KEY = 'circuit.original-database-owner';

function scopedLiveSessionKey(storage: StorageLike, profileId?: string | null): string | null {
  const owner = profileId ?? storage.getItem(ACTIVE_WORKOUT_PROFILE_KEY);
  if (!owner) return null;
  return LIVE_SESSION_KEY + ':' + encodeURIComponent(owner);
}

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function getLocalStorage(): StorageLike | null {
  return (globalThis as unknown as { localStorage?: StorageLike }).localStorage ?? null;
}


function isActiveWorkoutPlanLink(value: unknown): value is ActiveWorkoutPlanLink {
  if (!value || typeof value !== 'object') return false;
  const link = value as Partial<ActiveWorkoutPlanLink>;
  return typeof link.sessionId === 'string'
    && typeof link.sessionDate === 'string'
    && typeof link.sessionTitle === 'string'
    && typeof link.modifiedFromPlan === 'boolean';
}

function isLiveWorkoutSession(value: unknown): value is LiveWorkoutSessionSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<LiveWorkoutSessionSnapshot>;
  const pending = snapshot.pendingCompletion;
  const pendingValid = pending === undefined || (
    pending !== null
    && Number.isFinite(pending.completionFraction)
    && pending.completionFraction >= 0
    && pending.completionFraction <= 1
    && typeof pending.completedAt === 'string'
    && Number.isFinite(Date.parse(pending.completedAt))
  );
  return snapshot.schemaVersion === 1
    && Boolean(snapshot.workout?.id)
    && typeof snapshot.startedAt === 'string'
    && Number.isInteger(snapshot.stationIndex)
    && (snapshot.phase === 'work' || snapshot.phase === 'rest')
    && typeof snapshot.remainingSeconds === 'number'
    && pendingValid;
}

export function createInitialLiveWorkoutSession(
  workout: GeneratedWorkout,
  startedAt = new Date().toISOString(),
  planLink?: ActiveWorkoutPlanLink,
): LiveWorkoutSessionSnapshot {
  return {
    schemaVersion: 1,
    savedAt: startedAt,
    workout,
    startedAt,
    stationIndex: 0,
    phase: 'work',
    remainingSeconds: workout.stations[0]?.durationSeconds ?? 0,
    running: true,
    stationRounds: {},
    exerciseLoads: {},
    exerciseSets: {},
    restEntries: {},
    restRounds: 1,
    restLoadUnit: 'lb',
    planLink,
  };
}

export async function saveLiveWorkoutSession(
  snapshot: LiveWorkoutSessionSnapshot, profileId?: string | null,
): Promise<void> {
  const storage = getLocalStorage();
  if (!storage) throw new Error('Live workout storage is unavailable.');
  const key = scopedLiveSessionKey(storage, profileId);
  if (!key) throw new Error('Cannot save an unowned live workout.');
  const oldValue = storage.getItem(key);
  if (oldValue) {
    try {
      const previous: unknown = JSON.parse(oldValue);
      if (isLiveWorkoutSession(previous)
        && previous.pendingCompletion
        && previous.workout.id === snapshot.workout.id
        && previous.startedAt === snapshot.startedAt) {
        if (!snapshot.pendingCompletion) {
          // A late timer / background checkpoint must never erase the
          // original completion journal before the canonical ledger commits.
          return;
        }
        if (previous.pendingCompletion.completedAt !== snapshot.pendingCompletion.completedAt
          || previous.pendingCompletion.completionFraction !== snapshot.pendingCompletion.completionFraction) {
          throw new Error('Conflicting pending workout completion; original dose retained.');
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Conflicting pending workout completion')) {
        throw error;
      }
      // An invalid previous checkpoint is not evidence of a valid pending dose.
    }
  }
  storage.setItem(key, JSON.stringify(snapshot));
}

export async function loadLiveWorkoutSession(
  profileId?: string | null,
): Promise<LiveWorkoutSessionSnapshot | null> {
  const storage = getLocalStorage();
  if (!storage) return null;
  const key = scopedLiveSessionKey(storage, profileId);
  if (!key) return null;
  let serialized = storage.getItem(key);
  if (!serialized) {
    // Only the original database owner may adopt the single-profile legacy
    // checkpoint. This is a copy-before-delete migration; failed writes leave
    // the historical checkpoint untouched for explicit recovery.
    const owner = profileId ?? storage.getItem(ACTIVE_WORKOUT_PROFILE_KEY);
    if (owner && storage.getItem(ORIGINAL_DATABASE_OWNER_KEY) === owner) {
      const legacy = storage.getItem(LIVE_SESSION_KEY);
      if (legacy) {
        try {
          const candidate: unknown = JSON.parse(legacy);
          if (!isLiveWorkoutSession(candidate)) return null;
          storage.setItem(key, legacy);
          storage.removeItem(LIVE_SESSION_KEY);
          serialized = legacy;
        } catch {
          return null;
        }
      }
    }
  }
  if (!serialized) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isLiveWorkoutSession(parsed)) {
      // Do not silently remove an invalid persisted recovery journal.
      return null;
    }
    return {
      ...parsed,
      stationIndex: Math.max(0, parsed.stationIndex),
      remainingSeconds: Math.max(0, parsed.remainingSeconds),
      planLink: isActiveWorkoutPlanLink(parsed.planLink) ? parsed.planLink : undefined,
    };
  } catch {
    return null;
  }
}

export async function clearLiveWorkoutSession(profileId?: string | null): Promise<void> {
  const storage = getLocalStorage();
  if (!storage) return;
  const key = scopedLiveSessionKey(storage, profileId);
  if (key) storage.removeItem(key);
}
