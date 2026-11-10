import type { DailyTrainingCeiling, TrainingEvent } from '@circuit/planner';
import {
  appendStoredTrainingGuardrailEvent,
  getStoredDailyTrainingCeiling,
  listStoredTrainingGuardrailEvents,
  storeDailyTrainingCeiling,
} from './database';

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
