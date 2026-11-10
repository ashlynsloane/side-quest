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
    [/async beginWorkout\(/, /return startGate\.begin\(/, /assess: assessWorkoutStart/,
      /persist: saveLiveWorkoutSession/, /restoredForAthlete/]],
  ['Train recommended route retains planned identity',
    'apps/mobile/src/app/(tabs)/train.tsx',
    [/resolveRecommendedTrainingRoute\(/, /navigateRecommendedTraining\(/,
      /openPlannedWorkoutPreview/]],
  ['Workout starts serialized and account-scoped across awaits',
    'apps/mobile/src/services/guarded-workout-start.ts',
    [/if \(starting\)/, /deps\.activeAthleteId\(\) === owner/,
      /await deps\.persist\(/, /await deps\.discardPersisted\(owner\)/]],
  ['Foreground and periodic live-session review',
    'apps/mobile/src/app/active-workout.tsx',
    [/createActiveSessionMonitor\(/, /loadDailyCeiling\(/,
      /evaluateActiveSessionRecovery\(/, /AppState\.addEventListener/]],
  ['Monitor rejects unreadable recovery and ignores stale results',
    'apps/mobile/src/services/active-session-monitor.ts',
    [/inFlight/, /generation/, /onPause/, /subscribeForeground/]],
  ['Current Expo runtime routes are resolved to installed screens',
    'apps/mobile/src/ui/v30/expo-router-adapter.ts',
    [/resolveCurrentExpoRoute/, /'\/today-check-in'/,
      /'\/generate'/, /'\/workout-preview'/]],
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
  ['Live session checkpoint scoped to athlete',
    'apps/mobile/src/services/active-workout-persistence.ts',
    [/scopedSessionKey/, /scopedLiveWorkoutStorageKey/,
      /LEGACY_LIVE_SESSION_KEY/, /requireLocalStorage/]],
  ['Athlete-specific key construction',
    'packages/planner/src/live-workout-storage-policy.ts',
    [/encodeURIComponent\(athleteId\)/, /LIVE_WORKOUT_KEY_PREFIX/,
      /LEGACY_LIVE_WORKOUT_KEY/]],
  ['Workout restore bound to current athlete',
    'apps/mobile/src/state/workout-context.tsx',
    [/loadLiveWorkoutSession\(user\.id\)/, /persist: saveLiveWorkoutSession/,
      /assessActiveWorkoutMutation/]],
  ['No stale workout authorization after calendar change',
    'apps/mobile/src/app/active-workout.tsx',
    [/evaluateWorkoutAuthorizationAge/, /authorizationExpired/,
      /Save already completed activity/, /Discard unfinished session/]],
  ['Strict historical data reader',
    'apps/mobile/src/services/database.ts',
    [/listWorkoutLedgerEntriesForGuardrails/, /listEnduranceActivitiesForGuardrails/,
      /Stored training history is unreadable/]],
  ['All live swaps evaluated',
    'apps/mobile/src/app/active-workout.tsx',
    [/const mutation = updateActiveWorkout\(/, /if \(!mutation\.allowed\)/]],
  ['Active-session symptom interruption',
    'apps/mobile/src/app/active-workout.tsx',
    [/evaluateActiveSessionRecovery\(/, /getActiveTrainingCheckIn\(/,
      /loadDailyCeiling\(/, /Save completed work and stop/, /requiresRecoveryReview/]],
  ['Rolling 48-hour overlap with recorded strength',
    'apps/mobile/src/services/training-addition-gate.ts',
    [/RECENT_EXPOSURE_REVIEW_HOURS = 48/, /listWorkoutLedgerEntriesForGuardrails/,
      /listEnduranceActivitiesForGuardrails/, /lookbackHours: RECENT_EXPOSURE_REVIEW_HOURS/]],
  ['No bonus training if a daily plan is missing',
    'apps/mobile/src/services/training-addition-gate.ts',
    [/hasRecordedTrainingLoadOnDate\(/, /overrideAllowed: !anyActualTrainingToday/]],
  ['Escalating exercise substitutions are rejected',
    'packages/planner/src/active-workout-mutation.ts',
    [/Replacement introduces or increases muscle-region loading/,
      /Replacement introduces an unreviewed movement pattern/]],
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
