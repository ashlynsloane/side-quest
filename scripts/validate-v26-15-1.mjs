import fs from 'node:fs';

const plannerPath = 'packages/planner/src/causal-evidence.ts';
const domainPath = 'packages/domain/src/index.ts';
const planner = fs.readFileSync(plannerPath, 'utf8');
const domain = fs.readFileSync(domainPath, 'utf8');

const required = [
  'left.context.scheduleConstraints',
  'right.context.scheduleConstraints',
  'normalizeContextValues',
  'arraysEqual',
  "scheduleConstraints differ.",
];
for (const token of required) {
  if (!planner.includes(token)) throw new Error(`Missing V26.15.1 token: ${token}`);
}
if (planner.includes('context.scheduleConstraint]') || planner.includes("'scheduleConstraint'")) {
  throw new Error('Invalid singular scheduleConstraint access remains.');
}
if (!domain.includes('scheduleConstraints?: string[];')) {
  throw new Error('TrainingBlockContext scheduleConstraints contract is missing.');
}
console.log('V26.15.1 validation passed: causal context matching uses normalized scheduleConstraints arrays.');
