import fs from 'node:fs';
const required = [
  ['packages/domain/src/index.ts', 'SeasonOperationEvent'],
  ['packages/planner/src/season-operations.ts', 'evaluateSeasonConstraints'],
  ['packages/planner/src/season-operations.ts', 'buildSeasonAdjustmentProposal'],
  ['packages/planner/test/season-operations.test.ts', 'blocks an equipment-dependent ride'],
  ['apps/mobile/src/services/season-operations.ts', 'buildSeasonTimelineCards'],
];
for (const [file, token] of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  if (!fs.readFileSync(file, 'utf8').includes(token)) throw new Error(`Missing ${token} in ${file}`);
}
const planner = fs.readFileSync('packages/planner/src/season-operations.ts', 'utf8');
if (planner.includes('node:crypto')) throw new Error('Shared planner code must remain mobile-compatible.');
console.log('V26.26 validation passed: season events, constraints, adaptation proposals, mobile cards, and tests are present.');
