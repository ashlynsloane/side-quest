import type { DailyTrainingCeiling, TrainingEvent, RecoveryStatus, TrainingRegion } from '@circuit/planner';
import {
  appendStoredTrainingGuardrailEvent,
  getStoredDailyTrainingCeiling,
  listStoredTrainingGuardrailEvents,
  storeDailyTrainingCeiling,
  saveObservedTrainingRecovery,
} from './database';
import { acknowledgeRemoteRecovery, publishRemoteRecovery } from './server-training-ledger';

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
    // Keep the upload journal until the same explicit observation has been
    // stored locally. A retry must not fabricate a new server observation time.
    let eventId: string;
    try {
      eventId = await publishRemoteRecovery(userId, date, updates);
    } catch (error) {
      // A failed cloud upload must not clear anything. However an athlete's
      // worsening symptoms are still a local STOP signal even when offline,
      // or when an older pending "stable" event cannot be reconciled.
      const restrictive = Object.fromEntries(
        (['general', 'achilles', 'upper_back'] as TrainingRegion[])
          .filter((region) => updates[region] === 'worse' || updates[region] === 'red_flag')
          .map((region) => [region, updates[region]]),
      ) as Partial<Record<TrainingRegion, RecoveryStatus>>;
      if (Object.keys(restrictive).length) {
        try {
          await saveObservedTrainingRecovery(userId, date, restrictive);
        } catch {
          throw new Error('Cloud recovery upload and local restrictive safety save both failed. Stop training.');
        }
      }
      throw error; // Keep the cloud failure visible; another device may remain unaware.
    }
    await saveObservedTrainingRecovery(userId, date, updates);
    acknowledgeRemoteRecovery(userId, date, eventId);
    return;
  }
  await saveObservedTrainingRecovery(userId, date, updates);
}
