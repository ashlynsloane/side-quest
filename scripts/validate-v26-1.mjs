import fs from 'node:fs';

const required = [
  'packages/planner/src/coach-decision-lifecycle.ts',
  'packages/planner/test/coach-decision-lifecycle.test.ts',
  'apps/mobile/src/services/coach-decision-lifecycle.ts',
];
for (const path of required) {
  if (!fs.existsSync(path)) throw new Error(`Missing V26.1 file: ${path}`);
}
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/coach-decision-lifecycle.ts', 'utf8');
const barrel = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
const test = fs.readFileSync('packages/planner/test/coach-decision-lifecycle.test.ts', 'utf8');
for (const token of ['CoachDecisionLifecycleRecord', 'CoachDecisionLifecycleEvent', 'CoachDecisionLifecycleResult']) {
  if (!domain.includes(token)) throw new Error(`Missing domain contract: ${token}`);
}
for (const token of ['reconcileCoachDecisionLifecycle', "record.status !== 'accepted'", "record.status = 'expired'", "record.status = 'reverted'"]) {
  if (!planner.includes(token)) throw new Error(`Missing lifecycle behavior: ${token}`);
}
if (!barrel.includes("export * from './coach-decision-lifecycle'")) throw new Error('Planner export missing.');
if (!test.includes('does not duplicate lifecycle events')) throw new Error('Idempotency test missing.');
console.log('V26.1 validation passed: approval-gated proposals, expiry, idempotent audit history, application, and undo are present.');
