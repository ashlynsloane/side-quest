import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const required = [
  'packages/planner/src/visible-you-workspace.ts',
  'packages/planner/test/visible-you-workspace.test.ts',
  'apps/mobile/src/services/visible-you-workspace.ts',
  'apps/mobile/src/ui/v29/YouWorkspaceScreen.tsx',
  'apps/mobile/src/ui/v29/you-screen-spec.ts',
];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) throw new Error(`Missing ${rel}`);
const domain = fs.readFileSync(path.join(root, 'packages/domain/src/index.ts'), 'utf8');
const plannerIndex = fs.readFileSync(path.join(root, 'packages/planner/src/index.ts'), 'utf8');
const planner = fs.readFileSync(path.join(root, 'packages/planner/src/visible-you-workspace.ts'), 'utf8');
const screen = fs.readFileSync(path.join(root, 'apps/mobile/src/ui/v29/YouWorkspaceScreen.tsx'), 'utf8');
if ((domain.match(/export interface V29YouVisibleScreenModel/g) ?? []).length !== 1) throw new Error('Expected exactly one V29 visible You model.');
if (!plannerIndex.includes("export * from './visible-you-workspace';")) throw new Error('Planner visible You export missing.');
for (const phrase of ['Edit athlete profile', 'Friends', 'Sharing controls', 'Privacy']) if (!planner.includes(phrase) && !screen.includes(phrase)) throw new Error(`Required You action missing: ${phrase}`);
for (const phrase of ['Current context', 'Connections', 'Coach access', 'Friends and sharing', 'App controls']) if (!screen.includes(phrase)) throw new Error(`Required You section missing: ${phrase}`);
if (!screen.includes('StyleSheet.create<Record<string, ViewStyle>>')) throw new Error('Typed ViewStyle registry missing.');
if (!screen.includes('StyleSheet.create<Record<string, TextStyle>>')) throw new Error('Typed TextStyle registry missing.');
if (/fontWeight:\s*['"](?:650|750)['"]/.test(screen)) throw new Error('Unsupported font weight present.');
if (!screen.includes('minHeight: 44')) throw new Error('44-point target protection missing.');
console.log('V29.5 validation passed: visible You profile, context, integrations, coach access, social controls, privacy, and app settings are present.');
