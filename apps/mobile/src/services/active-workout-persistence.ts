import type { ActiveWorkoutCheckpoint, ActiveWorkoutPersistenceWrite, ActiveWorkoutRestoreResult } from '@circuit/domain';
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
