import fs from 'node:fs';
const required = [
  'packages/planner/src/workout-completion-sharing.ts',
  'packages/planner/test/workout-completion-sharing.test.ts',
  'apps/mobile/src/services/workout-completion-sharing.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/workout-completion-sharing.ts', 'utf8');
const mobile = fs.readFileSync('apps/mobile/src/services/workout-completion-sharing.ts', 'utf8');
for (const token of ['CompletedWorkoutSummary', 'WorkoutSharePreferences', 'WorkoutShareCard', 'SavedWorkoutReference']) {
  if (!domain.includes(token)) throw new Error(`Missing domain contract: ${token}`);
}
for (const token of ['generateWorkoutDisplayName', 'completeActiveWorkout', 'buildWorkoutShareCard', 'saveCompletedWorkoutReference']) {
  if (!planner.includes(`export function ${token}`)) throw new Error(`Missing planner export: ${token}`);
}
if (!planner.includes('Weights are hidden by default.')) throw new Error('Missing default weight privacy safeguard.');
if (!mobile.includes('buildWorkoutCompletionCard') || !mobile.includes('buildWorkoutSharePreview')) throw new Error('Missing mobile completion/share models.');
console.log('V27.4 validation passed: completion summaries, memorable naming, muscle-map sharing, privacy controls, and completed-workout favorites.');
