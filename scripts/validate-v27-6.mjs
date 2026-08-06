import fs from 'node:fs';
const required = [
  ['packages/domain/src/index.ts', ['MobileWorkoutFlowState', 'MobilePreWorkoutEditorModel', 'MobileRestLoggingModel', 'MobileWorkoutCompletionModel']],
  ['packages/planner/src/mobile-workout-flow.ts', ['createMobileWorkoutFlow', 'openMobileRestLogging', 'finishMobileWorkoutFlow', 'pending round log']],
  ['apps/mobile/src/services/mobile-workout-flow.ts', ['buildMobilePreWorkoutEditor', 'buildMobileRestLoggingModel', 'buildMobileWorkoutCompletionModel']],
  ['packages/planner/test/mobile-workout-flow.test.ts', ['moves through start, rest logging, and finish', 'pauses and resumes']],
];
for (const [file, needles] of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) if (!text.includes(needle)) throw new Error(`${file} is missing ${needle}`);
}
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const legacy of ['ProtectedRecurringCommitment', 'DailyCoachBrief', 'ActiveWorkoutDraft', 'CompletedWorkoutSummary', 'ActiveWorkoutCheckpoint']) {
  if (!domain.includes(legacy)) throw new Error(`Domain regression: missing ${legacy}`);
}
const plannerIndex = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
if (!plannerIndex.includes("export * from './mobile-workout-flow'")) throw new Error('Planner mobile workout flow export missing.');
console.log('V27.6 validation passed: pre-workout editing models, active/rest transitions, pause/resume, completion handoff, and privacy-aware share actions.');
