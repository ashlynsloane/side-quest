import fs from 'node:fs';

const required = [
  'packages/planner/src/visible-ui-shell.ts',
  'packages/planner/test/visible-ui-shell.test.ts',
  'apps/mobile/src/services/visible-ui-shell.ts',
  'apps/mobile/src/ui/v29/tokens.ts',
  'apps/mobile/src/ui/v29/shell-spec.ts',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`V29.0 missing ${file}`);
}
const planner = fs.readFileSync('packages/planner/src/visible-ui-shell.ts', 'utf8');
const test = fs.readFileSync('packages/planner/test/visible-ui-shell.test.ts', 'utf8');
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const shellSpec = fs.readFileSync('apps/mobile/src/ui/v29/shell-spec.ts', 'utf8');

for (const phrase of ['today', 'train', 'plan', 'progress', 'you']) {
  if (!planner.includes(phrase)) throw new Error(`V29.0 navigation missing ${phrase}`);
}
if (!planner.includes('minimumTapTarget: 44')) throw new Error('V29.0 must preserve 44-point tap targets.');
if (!planner.includes('visibleAcrossTabs: true')) throw new Error('V29.0 must preserve active workout recovery across tabs.');
const primaryTabDeclarations = domain.match(/export type SideQuestPrimaryTab\s*=/g) ?? [];
if (primaryTabDeclarations.length !== 1) throw new Error(`V29.0.1 requires exactly one SideQuestPrimaryTab declaration; found ${primaryTabDeclarations.length}.`);
if (!test.includes("from 'vitest'")) throw new Error('V29.0 tests must use Vitest.');
if (test.includes("node:test")) throw new Error('V29.0 may not use node:test.');
if (!shellSpec.includes('prohibitGenericRerouteCardGrid: true')) throw new Error('V29.0 must prohibit reroute-card grids.');
console.log('V29.0.1 validation passed: shared shell, navigation, active-workout recovery, accessibility, and visual tokens.');
