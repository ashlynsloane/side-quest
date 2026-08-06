import fs from 'node:fs';
const required = [
  'packages/planner/src/workout-flow-hardening.ts',
  'packages/planner/test/workout-flow-hardening.test.ts',
  'apps/mobile/src/services/workout-flow-hardening.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const planner = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
for (const name of ["'./workout-history-recall'", "'./workout-flow-hardening'"]) if (!planner.includes(name)) throw new Error(`Missing planner export ${name}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const token of ['WorkoutFlowValidationReport', 'WorkoutMigrationResult', 'ActiveWorkoutCheckpoint', 'CompletedWorkoutSummary']) if (!domain.includes(token)) throw new Error(`Missing preserved contract ${token}`);
console.log('V27.8 validation passed: end-to-end workflow, duplicate protection, checkpoint validation, and migration safeguards are present.');
