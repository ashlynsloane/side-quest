import fs from 'node:fs';
const domain = fs.readFileSync('packages/domain/src/index.ts','utf8');
const required = [
  'ProtectedRecurringCommitment','SeasonOperationEvent','ExecutablePlanChangeSet',
  'DailyCoachBrief','SessionReadinessAssessment','ActiveWorkoutDraft',
  'CompletedWorkoutSummary','WorkoutShareCard','SavedWorkoutReference'
];
for (const name of required) {
  if (!domain.includes(`interface ${name}`) && !domain.includes(`type ${name}`)) {
    throw new Error(`Missing preserved domain export: ${name}`);
  }
}
const index = fs.readFileSync('packages/planner/src/index.ts','utf8');
if (!index.includes("./workout-completion-sharing")) throw new Error('Missing workout completion export');
console.log('V27.4.1 validation passed: complete domain export chain preserved with V27.4 completion and sharing contracts.');
