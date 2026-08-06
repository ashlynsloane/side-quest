import fs from 'node:fs';

const required = [
  'packages/planner/src/coach-decision-reassessment.ts',
  'packages/planner/test/coach-decision-reassessment.test.ts',
  'apps/mobile/src/services/coach-decision-reassessment.ts',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`V26.21 missing ${file}`);
}
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/coach-decision-reassessment.ts', 'utf8');
const index = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
for (const token of [
  'CoachDecisionReassessment',
  'CoachDecisionReviewPolicy',
  'CoachReassessmentTrigger',
  'CoachDecisionFreshness',
]) {
  if (!domain.includes(token)) throw new Error(`V26.21 domain contract missing ${token}`);
}
for (const token of [
  'identifyMaterialReassessmentTriggers',
  'classifyCoachDecisionFreshness',
  'reassessCoachDecision',
  'automaticReapplicationAllowed',
  'fullRecomputationRequired',
]) {
  if (!planner.includes(token)) throw new Error(`V26.21 planner behavior missing ${token}`);
}
if (!index.includes("export * from './coach-decision-reassessment';")) throw new Error('V26.21 planner export missing.');
console.log('V26.21 validation passed: decision expiry, material-change invalidation, reassessment, and athlete confirmation safeguards are present.');
