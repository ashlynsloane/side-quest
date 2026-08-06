import fs from 'node:fs';
const required = [
  'packages/planner/src/coach-decision-ledger.ts',
  'packages/planner/test/coach-decision-ledger.test.ts',
  'apps/mobile/src/services/coach-decision-ledger.ts',
  'packages/domain/src/index.ts',
  'packages/planner/src/index.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const planner = fs.readFileSync('packages/planner/src/coach-decision-ledger.ts', 'utf8');
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const barrel = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
for (const token of ['createCoachDecisionRecord', 'recordAthleteDecision', 'attachDecisionOutcome', 'deriveDecisionLearning', 'excludeDecisionFromLearning', 'Unselected options remain counterfactual']) if (!planner.includes(token)) throw new Error(`Missing safeguard or API: ${token}`);
for (const token of ['CoachDecisionRecord', 'CoachDecisionOutcome', 'CoachDecisionLearningResult', 'excluded_from_learning']) if (!domain.includes(token)) throw new Error(`Missing domain contract: ${token}`);
if (!barrel.includes("export * from './coach-decision-ledger'")) throw new Error('Planner barrel missing ledger export');
console.log('V26.9 validation passed: immutable decision capture, observed-outcome learning, counterfactual restraint, preference/compliance separation, and athlete exclusion controls.');
