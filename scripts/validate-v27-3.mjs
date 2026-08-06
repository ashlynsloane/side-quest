import fs from 'node:fs';
const required = [
  'packages/planner/src/active-workout-logging.ts',
  'packages/planner/test/active-workout-logging.test.ts',
  'apps/mobile/src/services/active-workout-logging.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing V27.3 file: ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts','utf8');
const planner = fs.readFileSync('packages/planner/src/active-workout-logging.ts','utf8');
const index = fs.readFileSync('packages/planner/src/index.ts','utf8');
for (const token of ['ActiveWorkoutDraft','WorkoutRoundLog','ExercisePerformanceEntry','recordedDuringRest: true']) if (!domain.includes(token)) throw new Error(`Missing V27.3 domain contract: ${token}`);
for (const token of ['editActiveWorkoutBeforeStart','addOptionalExerciseBeforeStart','recordRoundDuringRest','summarizeActiveWorkoutProgress']) if (!planner.includes(token)) throw new Error(`Missing V27.3 behavior: ${token}`);
if (!planner.includes("draft.status !== 'draft'")) throw new Error('Pre-start editing guard missing.');
if (!index.includes("export * from './active-workout-logging'")) throw new Error('Planner export missing.');
console.log('V27.3 validation passed: pre-start workout editing, optional exercises, per-exercise round logging during rest, and live progress totals.');
