import type {
  ActiveWorkoutCheckpoint,
  WorkoutFlowValidationIssue,
  WorkoutFlowValidationReport,
  WorkoutFlowValidationStage,
  WorkoutMigrationResult,
} from '@circuit/domain';

const ORDER: WorkoutFlowValidationStage[] = [
  'generated', 'edited', 'started', 'logged', 'paused', 'resumed', 'finished', 'persisted', 'favorited', 'shared',
];

export function validateWorkoutFlow(input: {
  workoutId: string;
  completedStages: WorkoutFlowValidationStage[];
  checkpoint?: ActiveWorkoutCheckpoint;
  completionRecordIds?: string[];
  now?: string;
}): WorkoutFlowValidationReport {
  const issues: WorkoutFlowValidationIssue[] = [];
  const completed = new Set(input.completedStages);
  let highest = -1;
  for (const stage of input.completedStages) {
    const index = ORDER.indexOf(stage);
    if (index < highest) issues.push({ stage, severity: 'error', code: 'stage_order', message: 'Workout stages are out of order.' });
    highest = Math.max(highest, index);
  }
  const ids = input.completionRecordIds ?? [];
  const duplicateCompletionDetected = new Set(ids).size !== ids.length;
  if (duplicateCompletionDetected) issues.push({ stage: 'persisted', severity: 'error', code: 'duplicate_completion', message: 'Duplicate completion record detected.' });
  const staleCheckpointDetected = Boolean(input.checkpoint && input.checkpoint.workoutId !== input.workoutId);
  if (staleCheckpointDetected) issues.push({ stage: 'persisted', severity: 'error', code: 'stale_checkpoint', message: 'Checkpoint belongs to a different workout.' });
  if (completed.has('finished') && !completed.has('persisted')) issues.push({ stage: 'persisted', severity: 'warning', code: 'not_persisted', message: 'Finished workout has not been persisted.' });
  return {
    workoutId: input.workoutId,
    passed: !issues.some((issue) => issue.severity === 'error'),
    completedStages: [...input.completedStages],
    issues,
    duplicateCompletionDetected,
    staleCheckpointDetected,
    generatedAt: input.now ?? new Date().toISOString(),
  };
}

export function migrateWorkoutCheckpoint(
  checkpoint: ActiveWorkoutCheckpoint,
  targetSchemaVersion = 1,
): WorkoutMigrationResult {
  return {
    sourceSchemaVersion: checkpoint.schemaVersion,
    targetSchemaVersion,
    migrated: checkpoint.schemaVersion !== targetSchemaVersion,
    preservedWorkoutId: Boolean(checkpoint.workoutId),
    warnings: checkpoint.schemaVersion > targetSchemaVersion ? ['Checkpoint schema is newer than this application.'] : [],
  };
}
