import type { DailyTrainingCeiling, TrainingEvent, RecoveryStatus, TrainingRegion } from '@circuit/planner';
import {
  appendStoredTrainingGuardrailEvent,
  getStoredDailyTrainingCeiling,
  listStoredTrainingGuardrailEvents,
  storeDailyTrainingCeiling,
  saveObservedTrainingRecovery,
} from './database';
import { publishRemoteRecovery } from './server-training-ledger';

/**
 * Durable storage lives in the same per-athlete SQLite database as workouts.
 * No separate localStorage event array: repeated writes are idempotent by event ID.
 */
export async function saveDailyCeiling(
  userId: string, ceiling: DailyTrainingCeiling, overwrite = false,
): Promise<void> {
  await storeDailyTrainingCeiling(userId, ceiling, overwrite);
}

export async function loadDailyCeiling(
  userId: string, date: string,
): Promise<DailyTrainingCeiling | null> {
  return getStoredDailyTrainingCeiling(userId, date);
}

export async function loadTrainingEvents(
  userId: string, date: string,
): Promise<TrainingEvent[]> {
  return listStoredTrainingGuardrailEvents(userId, date);
}

export async function recordTrainingEvent(
  userId: string, event: TrainingEvent, trainingDate: string,
): Promise<void> {
  await appendStoredTrainingGuardrailEvent(userId, { ...event, trainingDate }, trainingDate);
}

/** Persist only explicitly rechecked regions, preserving the latest plan. */
export async function recordObservedRecovery(
  userId: string, date: string,
  updates: Partial<Record<TrainingRegion, RecoveryStatus>>,
  options: { syncCloud?: boolean } = {},
): Promise<void> {
  // Publish to the athlete-scoped server before updating local clearance.
  // If network/authentication fails, neither this device nor another should
  // interpret an unsynchronized 'stable' report as cloud clearance.
  if (options.syncCloud) {
    await publishRemoteRecovery(userId, date, updates);
  }
  await saveObservedTrainingRecovery(userId, date, updates);
}
