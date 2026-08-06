import fs from 'node:fs';

const required = [
  'packages/planner/src/train-workspace.ts',
  'packages/planner/test/train-workspace.test.ts',
  'apps/mobile/src/services/train-workspace.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const symbol of ['TrainWorkspaceModel', 'TrainBuilderPreferences', 'TrainWorkoutCard', 'TrainActiveWorkoutSummary']) {
  if (!domain.includes(`interface ${symbol}`)) throw new Error(`Missing domain contract: ${symbol}`);
}
const planner = fs.readFileSync('packages/planner/src/train-workspace.ts', 'utf8');
for (const phrase of ['Build my workout', 'Resume workout', 'quickPresets', 'savedAndRecent']) {
  if (!planner.includes(phrase)) throw new Error(`Train workspace is missing behavior: ${phrase}`);
}
const test = fs.readFileSync('packages/planner/test/train-workspace.test.ts', 'utf8');
if (!test.includes("from 'vitest'")) throw new Error('Train workspace tests must use Vitest.');
if (test.includes("from 'node:test'")) throw new Error('Train workspace test contains node:test.');
const index = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
if (!index.includes("export * from './train-workspace'")) throw new Error('Planner does not export Train workspace.');
console.log('V28.2 validation passed: Train workspace provides direct workout creation, active-workout recovery, recommendations, recall, and contextual social state.');
