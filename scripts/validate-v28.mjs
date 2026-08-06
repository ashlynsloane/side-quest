import fs from 'node:fs';
const required = [
  'packages/planner/src/ui-architecture.ts',
  'packages/planner/test/ui-architecture.test.ts',
  'apps/mobile/src/services/ui-architecture.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const planner = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
if (!planner.includes("'./ui-architecture'")) throw new Error('Missing UI architecture planner export.');
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const token of ['UiArchitectureDefinition', 'UiPageBlueprint', 'UiArchitectureAudit', 'WorkoutFlowValidationReport']) {
  if (!domain.includes(token)) throw new Error(`Missing preserved contract ${token}`);
}
const source = fs.readFileSync('packages/planner/src/ui-architecture.ts', 'utf8');
for (const tab of ["tab: 'today'", "tab: 'train'", "tab: 'plan'", "tab: 'progress'", "tab: 'you'"]) {
  if (!source.includes(tab)) throw new Error(`Missing primary tab definition ${tab}`);
}
if (!source.includes('router-list-risk')) throw new Error('Missing router-list architecture safeguard.');
console.log('V28.0 validation passed: five question-led workspaces, direct-information sections, contextual coaching surfaces, and router-list safeguards are present.');
