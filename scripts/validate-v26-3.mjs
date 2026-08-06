import fs from 'node:fs';

const required = [
  'packages/planner/src/coach-preference-policy.ts',
  'packages/planner/test/coach-preference-policy.test.ts',
  'apps/mobile/src/services/coach-preference-policy.ts',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing V26.3 file: ${file}`);
}
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const symbol of ['AthleteCoachingPreferences', 'CoachPreferencePolicyInput', 'CoachPreferencePolicyResult', 'CoachAutonomyLevel']) {
  if (!domain.includes(symbol)) throw new Error(`Missing V26.3 domain contract: ${symbol}`);
}
const planner = fs.readFileSync('packages/planner/src/coach-preference-policy.ts', 'utf8');
for (const marker of ['applyCoachPreferencePolicy', 'protectedSessionIds', 'advisory_only', 'High-priority and critical']) {
  if (!planner.includes(marker)) throw new Error(`Missing V26.3 behavior: ${marker}`);
}
if (!fs.readFileSync('packages/planner/src/index.ts', 'utf8').includes("export * from './coach-preference-policy';")) {
  throw new Error('V26.3 planner export is missing.');
}
console.log('V26.3 validation passed: athlete coaching preferences, autonomy boundaries, protected sessions, and review safeguards are present.');
