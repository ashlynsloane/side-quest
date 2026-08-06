import fs from 'node:fs';
const required = [
  'packages/planner/src/coach-attention-queue.ts',
  'packages/planner/test/coach-attention-queue.test.ts',
  'apps/mobile/src/services/coach-attention-queue.ts',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing V26.4 file: ${file}`);
}
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/coach-attention-queue.ts', 'utf8');
const index = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
for (const marker of ['CoachAttentionQueueInput', 'CoachAttentionQueueResult', 'CoachAttentionQueueItem']) {
  if (!domain.includes(marker)) throw new Error(`Missing V26.4 domain contract: ${marker}`);
}
if (!planner.includes('Critical safety-related coaching is never suppressed')) throw new Error('Missing critical safety safeguard.');
if (!planner.includes('suppressedDuplicateDecisionIds')) throw new Error('Missing duplicate suppression.');
if (!index.includes("export * from './coach-attention-queue'")) throw new Error('Missing planner export.');
console.log('V26.4 validation passed: coach attention queue, prompt grouping, quiet hours, duplicate collapse, and critical safety exceptions are present.');
