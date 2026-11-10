import 'expo-sqlite/localStorage/install';

import type {
  ActiveWorkoutCheckpoint,
  ActiveWorkoutPersistenceWrite,
  ActiveWorkoutRestoreResult,
  GeneratedWorkout,
} from '@circuit/domain';
import { buildActiveWorkoutPersistenceWrite, restoreActiveWorkoutCheckpoint, scopedLiveWorkoutStorageKey, LEGACY_LIVE_WORKOUT_KEY } from '@circuit/planner';


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
}

// v1 was unscoped and could expose one athlete's paused session to another
// athlete who signs in on the same device. Never auto-restore that key.
const LEGACY_LIVE_SESSION_KEY = LEGACY_LIVE_WORKOUT_KEY;
const scopedSessionKey = scopedLiveWorkoutStorageKey;

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
  const workout = snapshot.workout;
  if (!workout || !Array.isArray(workout.stations) || workout.stations.length === 0 ||
      !workout.id || !Number.isFinite(workout.estimatedElapsedSeconds) ||
      workout.estimatedElapsedSeconds <= 0 ||
      !workout.stations.every((station) => station && station.id &&
        Number.isFinite(station.durationSeconds) && station.durationSeconds > 0 &&
        Array.isArray(station.exercises))) return false;
  return snapshot.schemaVersion === 1
    && typeof snapshot.startedAt === 'string'
    && Number.isFinite(Date.parse(snapshot.startedAt))
    && typeof snapshot.savedAt === 'string'
    && Number.isFinite(Date.parse(snapshot.savedAt))
    && Number.isInteger(snapshot.stationIndex)
    && snapshot.stationIndex! >= 0 && snapshot.stationIndex! < workout.stations.length
    && (snapshot.phase === 'work' || snapshot.phase === 'rest')
    && typeof snapshot.remainingSeconds === 'number'
    && Number.isFinite(snapshot.remainingSeconds) && snapshot.remainingSeconds >= 0
    && typeof snapshot.running === 'boolean'
    && Number.isInteger(snapshot.restRounds)
    && snapshot.restRounds! >= 1 && snapshot.restRounds! <= 30
    && !!snapshot.stationRounds && typeof snapshot.stationRounds === 'object'
    && !!snapshot.exerciseSets && typeof snapshot.exerciseSets === 'object'
    && !!snapshot.restEntries && typeof snapshot.restEntries === 'object';
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

function requireLocalStorage(): StorageLike {
  const store = getLocalStorage();
  if (!store) throw new Error('Local workout checkpoint storage is unavailable');
  return store;
}

export async function saveLiveWorkoutSession(
  snapshot: LiveWorkoutSessionSnapshot,
  athleteId: string,
): Promise<void> {
  const storage = requireLocalStorage();
  const key = scopedSessionKey(athleteId);
  storage.setItem(key, JSON.stringify(snapshot));
}

export async function loadLiveWorkoutSession(
  athleteId: string,
): Promise<LiveWorkoutSessionSnapshot | null> {
  const storage = requireLocalStorage();
  const key = scopedSessionKey(athleteId);
  const serialized = storage.getItem(key);
  if (!serialized) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isLiveWorkoutSession(parsed)) {
      storage.removeItem(key);
      return null;
    }
    return {
      ...parsed,
      stationIndex: Math.max(0, parsed.stationIndex),
      remainingSeconds: Math.max(0, parsed.remainingSeconds),
      planLink: isActiveWorkoutPlanLink(parsed.planLink) ? parsed.planLink : undefined,
    };
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export async function clearLiveWorkoutSession(athleteId: string): Promise<void> {
  const storage = requireLocalStorage();
  storage.removeItem(scopedSessionKey(athleteId));
  // One-way cleanup: do not read or migrate unscoped legacy sessions because
  // ownership cannot be verified on a shared device.
  storage.removeItem(LEGACY_LIVE_SESSION_KEY);
}
