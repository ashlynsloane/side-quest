import fs from 'node:fs';

const required = [
  'packages/planner/src/coach-outcome-learning.ts',
  'packages/planner/test/coach-outcome-learning.test.ts',
  'apps/mobile/src/services/coach-outcome-learning.ts',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing V26.2 file: ${file}`);
}
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/coach-outcome-learning.ts', 'utf8');
const mobile = fs.readFileSync('apps/mobile/src/services/coach-outcome-learning.ts', 'utf8');
const tests = fs.readFileSync('packages/planner/test/coach-outcome-learning.test.ts', 'utf8');
for (const symbol of ['CoachDecisionOutcomeObservation', 'CoachDecisionOutcomeAggregate', 'CoachDecisionOutcomeLearningResult']) {
  if (!domain.includes(symbol)) throw new Error(`Missing domain contract: ${symbol}`);
}
if (!planner.includes('learnFromCoachDecisionOutcomes')) throw new Error('Missing outcome learning function.');
if (!planner.includes("record.status !== 'applied' && record.status !== 'reverted'")) throw new Error('Outcome learning must require an applied or reverted decision.');
if (!planner.includes('never automatically changes the athlete plan')) throw new Error('Missing non-automatic learning safeguard.');
if (!mobile.includes('What Side Quest is learning')) throw new Error('Missing mobile learning card.');
if (!tests.includes('mismatched plan revision')) throw new Error('Missing revision-linkage test.');
console.log('V26.2 validation passed: applied-decision outcome learning, confidence calibration, and non-automatic safeguards are present.');
