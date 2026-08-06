import fs from 'node:fs';

const required = [
  'packages/planner/src/plan-workspace.ts',
  'packages/planner/test/plan-workspace.test.ts',
  'apps/mobile/src/services/plan-workspace.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const symbol of ['PlanWorkspaceModel', 'PlanPhaseSummary', 'PlanDay', 'PlanSession', 'PlanAlert', 'PlanRoadmapBlock']) {
  if (!domain.includes(`interface ${symbol}`)) throw new Error(`Missing domain contract: ${symbol}`);
}
const planner = fs.readFileSync('packages/planner/src/plan-workspace.ts', 'utf8');
for (const phrase of ['Adjust weekly availability', 'Add protected commitment', 'planWeekMinutes', 'planEmptyState']) {
  if (!planner.includes(phrase)) throw new Error(`Plan workspace is missing behavior: ${phrase}`);
}
for (const banned of ['completion percentage', 'consistency score', 'streak']) {
  if (planner.toLowerCase().includes(banned)) throw new Error(`Plan workspace contains banned pressure metric: ${banned}`);
}
const test = fs.readFileSync('packages/planner/test/plan-workspace.test.ts', 'utf8');
if (!test.includes("from 'vitest'")) throw new Error('Plan workspace tests must use Vitest.');
if (test.includes("from 'node:test'")) throw new Error('Plan workspace test contains node:test.');
const index = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
if (!index.includes("export * from './plan-workspace'")) throw new Error('Planner does not export Plan workspace.');
console.log('V28.3 validation passed: Plan is a week-centered training workspace with phase context, actionable conflicts, planning controls, and a longer-range roadmap.');
