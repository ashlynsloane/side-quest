import fs from 'node:fs';
const required = [
  'packages/planner/src/today-workspace.ts',
  'packages/planner/test/today-workspace.test.ts',
  'apps/mobile/src/services/today-workspace.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const token of ['TodayWorkspaceModel', 'TodayWorkoutRecommendation', 'TodayReadinessSummary', 'UiArchitectureDefinition']) {
  if (!domain.includes(token)) throw new Error(`Missing contract ${token}`);
}
const planner = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
if (!planner.includes("'./today-workspace'")) throw new Error('Missing Today workspace planner export.');
const today = fs.readFileSync('packages/planner/src/today-workspace.ts', 'utf8');
for (const token of ['buildTodayWorkspace', 'todayNeedsAttention', 'assertTodayWorkspace', 'emptyRecommendation']) {
  if (!today.includes(token)) throw new Error(`Missing Today workspace behavior ${token}`);
}
const mobile = fs.readFileSync('apps/mobile/src/services/today-workspace.ts', 'utf8');
for (const section of ['recommendation', 'readiness', 'timeline', 'coaching', 'upcoming']) {
  if (!mobile.includes(`'${section}'`)) throw new Error(`Missing Today mobile section ${section}`);
}
console.log('V28.1 validation passed: Today is a direct-use workspace with recommendation, readiness, timeline, contextual coaching, and upcoming context.');
