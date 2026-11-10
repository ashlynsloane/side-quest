import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cache = new Map();
function file(path) {
  if (!cache.has(path)) cache.set(path, readFileSync(resolve(root, path), 'utf8'));
  return cache.get(path);
}
const contracts = [
  ['Central authorization before session creation',
    'apps/mobile/src/state/workout-context.tsx',
    [/async beginWorkout\(/, /assessWorkoutStart\(/, /if \(!assessment\.authorized\)/,
      /await saveLiveWorkoutSession\(/, /startingWorkout\.current/]],
  ['Workout preview intervention and explicit override',
    'apps/mobile/src/app/workout-preview.tsx',
    [/await beginWorkout\(/, /decision !== 'stop'/, /overrideAllowed !== false/, /overrideReason/, /daily-training-ceiling/]],
  ['Quick workouts through preview',
    'apps/mobile/src/app/generate.tsx', [/router\.push\('\/workout-preview'/]],
  ['Favorites through preview',
    'apps/mobile/src/app/favorites.tsx', [/router\.push\('\/workout-preview'/]],
  ['Shared room start authorized separately',
    'apps/mobile/src/app/workout-room.tsx',
    [/assessWorkoutStart\(/, /await sharedWorkoutCleared\(\)/]],
  ['Shared completion reconciled',
    'apps/mobile/src/app/together-session.tsx',
    [/recordActualWorkoutCompletion\(/, /ledgerId:/, /completionSaved/]],
  ['Solo completion reconciled',
    'apps/mobile/src/app/active-workout.tsx',
    [/recordActualWorkoutCompletion\(/, /completionSaved/, /Retry saving workout/]],
  ['Post-workout behavioral intervention logged',
    'apps/mobile/src/app/active-workout.tsx',
    [/I want to do more/, /saveTrainingUrge/, /kind: 'urge'/]],
  ['SQLite budget and audit ledger',
    'apps/mobile/src/services/database.ts',
    [/CREATE TABLE IF NOT EXISTS daily_training_ceilings/, /CREATE TABLE IF NOT EXISTS training_guardrail_events/,
      /withExclusiveTransactionAsync/, /saveObservedTrainingRecovery/]],
  ['Daily and athlete-specific storage',
    'apps/mobile/src/services/training-guardrail-storage.ts',
    [/getStoredDailyTrainingCeiling/, /listStoredTrainingGuardrailEvents/, /recordObservedRecovery/]],
  ['Live plan and actual workout integration',
    'apps/mobile/src/services/training-addition-gate.ts',
    [/getEffectiveDailyCeiling/, /reconcileCompletedWorkoutHistory/, /listEnduranceActivities/,
      /assessCrossSportExposure/, /planLedgerReconciliation/, /result\.overrideAllowed === false/]],
  ['Exercise-level tissue inference',
    'packages/planner/src/training-region-inference.ts',
    [/exercise\.bodyRegions/, /exercise\.jointLoads/, /exercise\.movementPatterns/]],
  ['Stale recovery invalidation',
    'packages/planner/src/daily-training-guardrails.ts',
    [/recoveryObservedAt/, /laterExposure/, /pauseTraining/, /retractedIds/]],
  ['Recovery observations are explicit',
    'apps/mobile/src/app/daily-training-ceiling.tsx',
    [/recheckedRegions/, /recordObservedRecovery\(/]],
  ['Privacy export and deletion',
    'apps/mobile/src/services/database.ts',
    [/EXPORT_TABLES=[^\n]*daily_training_ceilings/, /EXPORT_TABLES=[^\n]*training_guardrail_events/]],
];
let assertions = 0;
for (const [description, path, patterns] of contracts) {
  const text = file(path);
  for (const pattern of patterns) {
    assert.match(text, pattern, `${description}: missing ${pattern} in ${path}`);
    assertions += 1;
  }
  process.stdout.write(`PASS ${description}\n`);
}
// Regression: do not add new, unreviewed direct starts to these routes.
for (const path of [
  'apps/mobile/src/app/generate.tsx', 'apps/mobile/src/app/favorites.tsx',
]) {
  assert.doesNotMatch(file(path), /beginWorkout\(/, `${path} bypasses the guarded preview`);
  assertions += 1;
}
process.stdout.write(`Training guardrail contract verified: ${contracts.length} integrations, ${assertions} assertions.\n`);
