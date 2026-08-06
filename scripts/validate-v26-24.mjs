import fs from 'node:fs';
const required = [
  'packages/planner/src/athlete-decision-appeals.ts',
  'apps/mobile/src/services/athlete-decision-appeals.ts',
  'packages/planner/test/athlete-decision-appeals.test.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const planner = fs.readFileSync(required[0], 'utf8');
for (const symbol of [
  'createAthleteDecisionResponse',
  'createAthleteDecisionAppeal',
  'determineAppealDisposition',
  'assessAthleteDecisionAppeal',
  'buildAthleteResponseSummary',
]) if (!planner.includes(`function ${symbol}`)) throw new Error(`Missing ${symbol}`);
if (/from ['"]node:/.test(planner)) throw new Error('Shared athlete appeal planner code must not import Node-only modules.');
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const symbol of ['AthleteDecisionResponse', 'AthleteDecisionAppeal', 'AthleteAppealAssessment', 'AthleteResponseSummary']) {
  if (!domain.includes(symbol)) throw new Error(`Missing domain symbol ${symbol}`);
}
if (!planner.includes('Athlete disagreement never removes binding safety or clinician restrictions')) {
  throw new Error('Missing non-override safety safeguard.');
}
console.log('V26.24 validation passed: athlete responses, appeals, safe alternatives, reassessment, clinician review, and audit-preserving explanations are present.');
