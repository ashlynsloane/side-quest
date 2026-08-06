import type {
  ActiveWorkoutCheckpoint,
  ActiveWorkoutCompletionCommit,
  ActiveWorkoutDraft,
  ActiveWorkoutPersistenceWrite,
  ActiveWorkoutRestoreResult,
  WorkoutRoundLog,
} from '@circuit/domain';

const SCHEMA_VERSION = 1 as const;

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
}

function deduplicateRoundLogs(logs: WorkoutRoundLog[], workoutId: string): { logs: WorkoutRoundLog[]; removed: number } {
  const seen = new Set<string>();
  const result: WorkoutRoundLog[] = [];
  let removed = 0;
  for (const log of logs) {
    if (log.workoutId !== workoutId) throw new Error(`Round log ${log.roundLogId} belongs to another workout.`);
    if (seen.has(log.roundLogId)) { removed += 1; continue; }
    seen.add(log.roundLogId);
    result.push(log);
  }
  return { logs: result, removed };
}

export function createActiveWorkoutCheckpoint(input: {
  draft: ActiveWorkoutDraft;
  roundLogs?: WorkoutRoundLog[];
  currentStationId?: string;
  currentRoundNumber?: number;
  elapsedSeconds?: number;
  savedAt: string;
}): ActiveWorkoutCheckpoint {
  if (input.draft.status !== 'active') throw new Error('Only an active workout can create an active checkpoint.');
  const currentRoundNumber = input.currentRoundNumber ?? 1;
  const elapsedSeconds = input.elapsedSeconds ?? 0;
  if (!Number.isInteger(currentRoundNumber) || currentRoundNumber <= 0) throw new Error('Current round number must be a positive integer.');
  assertNonNegativeInteger(elapsedSeconds, 'Elapsed seconds');
  const deduped = deduplicateRoundLogs(input.roundLogs ?? [], input.draft.workoutId);
  return {
    schemaVersion: SCHEMA_VERSION,
    checkpointId: `active-workout:${input.draft.workoutId}`,
    workoutId: input.draft.workoutId,
    persistenceStatus: 'active',
    draft: input.draft,
    roundLogs: deduped.logs,
    currentStationId: input.currentStationId,
    currentRoundNumber,
    elapsedSeconds,
    timerState: 'running',
    savedAt: input.savedAt,
    revision: 1,
  };
}

export function saveActiveWorkoutCheckpoint(
  checkpoint: ActiveWorkoutCheckpoint,
  changes: Partial<Pick<ActiveWorkoutCheckpoint, 'roundLogs' | 'currentStationId' | 'currentRoundNumber' | 'elapsedSeconds' | 'timerState' | 'persistenceStatus'>>,
  savedAt: string,
  expectedRevision: number,
): ActiveWorkoutCheckpoint {
  if (checkpoint.revision !== expectedRevision) throw new Error('The active workout checkpoint is stale. Reload before saving.');
  if (checkpoint.persistenceStatus === 'completed' || checkpoint.persistenceStatus === 'abandoned') throw new Error('A terminal workout checkpoint cannot be updated.');
  const roundLogs = changes.roundLogs ?? checkpoint.roundLogs;
  const deduped = deduplicateRoundLogs(roundLogs, checkpoint.workoutId);
  const currentRoundNumber = changes.currentRoundNumber ?? checkpoint.currentRoundNumber;
  const elapsedSeconds = changes.elapsedSeconds ?? checkpoint.elapsedSeconds;
  if (!Number.isInteger(currentRoundNumber) || currentRoundNumber <= 0) throw new Error('Current round number must be a positive integer.');
  assertNonNegativeInteger(elapsedSeconds, 'Elapsed seconds');
  return { ...checkpoint, ...changes, roundLogs: deduped.logs, currentRoundNumber, elapsedSeconds, savedAt, revision: checkpoint.revision + 1 };
}

export function pauseActiveWorkoutCheckpoint(checkpoint: ActiveWorkoutCheckpoint, savedAt: string): ActiveWorkoutCheckpoint {
  return saveActiveWorkoutCheckpoint(checkpoint, { persistenceStatus: 'paused', timerState: 'paused' }, savedAt, checkpoint.revision);
}

export function resumeActiveWorkoutCheckpoint(checkpoint: ActiveWorkoutCheckpoint, savedAt: string): ActiveWorkoutCheckpoint {
  if (checkpoint.persistenceStatus !== 'paused') throw new Error('Only a paused workout can be resumed.');
  return saveActiveWorkoutCheckpoint(checkpoint, { persistenceStatus: 'active', timerState: 'running' }, savedAt, checkpoint.revision);
}

export function restoreActiveWorkoutCheckpoint(serialized: string): ActiveWorkoutRestoreResult {
  const parsed = JSON.parse(serialized) as ActiveWorkoutCheckpoint;
  if (parsed.schemaVersion !== SCHEMA_VERSION) throw new Error('Unsupported active workout checkpoint version.');
  if (!parsed.workoutId || parsed.draft?.workoutId !== parsed.workoutId) throw new Error('Checkpoint workout identity is invalid.');
  assertNonNegativeInteger(parsed.elapsedSeconds, 'Elapsed seconds');
  const deduped = deduplicateRoundLogs(parsed.roundLogs ?? [], parsed.workoutId);
  const warnings: string[] = [];
  if (deduped.removed > 0) warnings.push(`${deduped.removed} duplicate round log(s) were removed during recovery.`);
  const recoveredAfterInterruption = parsed.persistenceStatus === 'active' && parsed.timerState === 'running';
  const checkpoint = recoveredAfterInterruption
    ? { ...parsed, persistenceStatus: 'paused' as const, timerState: 'paused' as const, roundLogs: deduped.logs }
    : { ...parsed, roundLogs: deduped.logs };
  if (recoveredAfterInterruption) warnings.push('The timer was paused because the app closed while the workout was active.');
  return { checkpoint, recoveredAfterInterruption, duplicateRoundLogsRemoved: deduped.removed, warnings };
}

export function buildActiveWorkoutPersistenceWrite(checkpoint: ActiveWorkoutCheckpoint): ActiveWorkoutPersistenceWrite {
  return {
    storageKey: `sidequest.active-workout.${checkpoint.workoutId}`,
    serializedCheckpoint: JSON.stringify(checkpoint),
    expectedPreviousRevision: checkpoint.revision === 1 ? null : checkpoint.revision - 1,
    nextRevision: checkpoint.revision,
  };
}

export function commitActiveWorkoutCompletion(checkpoint: ActiveWorkoutCheckpoint, completedAt: string): ActiveWorkoutCompletionCommit {
  const completionRecordId = checkpoint.completionRecordId ?? `completed-workout:${checkpoint.workoutId}`;
  if (checkpoint.persistenceStatus === 'completed') {
    return { checkpoint, completionRecordId, alreadyCommitted: true };
  }
  if (checkpoint.persistenceStatus === 'abandoned') throw new Error('An abandoned workout cannot be completed.');
  const completed: ActiveWorkoutCheckpoint = {
    ...checkpoint,
    persistenceStatus: 'completed',
    timerState: 'stopped',
    draft: { ...checkpoint.draft, status: 'completed', completedAt },
    completedAt,
    completionRecordId,
    savedAt: completedAt,
    revision: checkpoint.revision + 1,
  };
  return { checkpoint: completed, completionRecordId, alreadyCommitted: false };
}

export function abandonActiveWorkoutCheckpoint(checkpoint: ActiveWorkoutCheckpoint, abandonedAt: string): ActiveWorkoutCheckpoint {
  if (checkpoint.persistenceStatus === 'completed') throw new Error('A completed workout cannot be abandoned.');
  if (checkpoint.persistenceStatus === 'abandoned') return checkpoint;
  return { ...checkpoint, persistenceStatus: 'abandoned', timerState: 'stopped', abandonedAt, savedAt: abandonedAt, revision: checkpoint.revision + 1 };
}
