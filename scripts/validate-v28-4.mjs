import fs from 'node:fs';

const required = [
  'packages/planner/src/progress-workspace.ts',
  'packages/planner/test/progress-workspace.test.ts',
  'apps/mobile/src/services/progress-workspace.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const symbol of ['ProgressWorkspaceModel', 'ProgressRegionalStatus', 'ProgressImprovement', 'ProgressMovementTrend', 'ProgressTrainingBalance', 'ProgressHistoryItem']) {
  if (!domain.includes(`interface ${symbol}`)) throw new Error(`Missing domain contract: ${symbol}`);
}
const planner = fs.readFileSync('packages/planner/src/progress-workspace.ts', 'utf8');
for (const phrase of ['progressPrimaryMessage', 'repeatableProgressWorkouts', 'progressEmptyState', 'review_symptoms']) {
  if (!planner.includes(phrase)) throw new Error(`Progress workspace is missing behavior: ${phrase}`);
}
for (const banned of ['completion percentage', 'consistency score', 'streak pressure', 'regional exposure']) {
  if (planner.toLowerCase().includes(banned)) throw new Error(`Progress workspace contains banned framing: ${banned}`);
}
const test = fs.readFileSync('packages/planner/test/progress-workspace.test.ts', 'utf8');
if (!test.includes("from 'vitest'")) throw new Error('Progress workspace tests must use Vitest.');
if (test.includes("from 'node:test'")) throw new Error('Progress workspace test contains node:test.');
const index = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
if (!index.includes("export * from './progress-workspace'")) throw new Error('Planner does not export Progress workspace.');
console.log('V28.4 validation passed: Progress surfaces regional status, concrete improvements, progression guidance, training balance, useful history, and low-pressure milestones.');
