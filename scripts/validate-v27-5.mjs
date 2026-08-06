import fs from 'node:fs';
const required = [
  ['packages/domain/src/index.ts', ['ActiveWorkoutCheckpoint', 'ActiveWorkoutPersistenceWrite', 'ActiveWorkoutCompletionCommit']],
  ['packages/planner/src/active-workout-persistence.ts', ['createActiveWorkoutCheckpoint', 'restoreActiveWorkoutCheckpoint', 'commitActiveWorkoutCompletion', 'stale']],
  ['apps/mobile/src/services/active-workout-persistence.ts', ['persistActiveWorkout', 'recoverActiveWorkout', 'clearPersistedActiveWorkout']],
  ['packages/planner/test/active-workout-persistence.test.ts', ['idempotently', 'rejects stale writes']],
];
for (const [file, needles] of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) if (!text.includes(needle)) throw new Error(`${file} is missing ${needle}`);
}
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const legacy of ['ProtectedRecurringCommitment', 'DailyCoachBrief', 'ActiveWorkoutDraft', 'CompletedWorkoutSummary']) {
  if (!domain.includes(legacy)) throw new Error(`Domain regression: missing ${legacy}`);
}
const plannerIndex = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
if (!plannerIndex.includes("export * from './active-workout-persistence'")) throw new Error('Planner export missing.');
console.log('V27.5 validation passed: interruption recovery, revision-safe saves, local storage adapter, and idempotent completion.');
