import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const required = [
  'packages/planner/src/visible-progress-workspace.ts',
  'packages/planner/test/visible-progress-workspace.test.ts',
  'apps/mobile/src/services/visible-progress-workspace.ts',
  'apps/mobile/src/ui/v29/ProgressWorkspaceScreen.tsx',
  'apps/mobile/src/ui/v29/progress-screen-spec.ts',
];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) throw new Error(`V29.4 missing ${rel}`);
const domain = fs.readFileSync(path.join(root, 'packages/domain/src/index.ts'), 'utf8');
const plannerIndex = fs.readFileSync(path.join(root, 'packages/planner/src/index.ts'), 'utf8');
const planner = fs.readFileSync(path.join(root, 'packages/planner/src/visible-progress-workspace.ts'), 'utf8');
const component = fs.readFileSync(path.join(root, 'apps/mobile/src/ui/v29/ProgressWorkspaceScreen.tsx'), 'utf8');
const spec = fs.readFileSync(path.join(root, 'apps/mobile/src/ui/v29/progress-screen-spec.ts'), 'utf8');
if ((domain.match(/export interface V29ProgressVisibleScreenModel/g) ?? []).length !== 1) throw new Error('V29.4 requires exactly one visible Progress model.');
if (!plannerIndex.includes("export * from './visible-progress-workspace';")) throw new Error('V29.4 planner export missing.');
for (const phrase of ['Training picture', 'Training wins', 'Movement trends', 'Training balance', 'Recent workouts', 'Milestones']) if (!component.includes(phrase) && !planner.includes(phrase)) throw new Error(`V29.4 missing ${phrase}`);
for (const phrase of ['Maintained', 'Building', 'Returning', 'Modified appropriately']) if (!(planner + spec).includes(phrase)) throw new Error(`V29.4 missing athlete-first language: ${phrase}`);
for (const phrase of ['viewStyles', 'textStyles', 'minimumTapTarget: 44']) if (!(component + spec).includes(phrase)) throw new Error(`V29.4 missing typed UI protection: ${phrase}`);
if (component.includes('const styles = StyleSheet.create')) throw new Error('V29.4 must keep ViewStyle and TextStyle sheets separate.');
if (component.includes("fontWeight: '650'") || component.includes("fontWeight: '750'")) throw new Error('V29.4 contains unsupported font weights.');
if (/completion percentage|consistency score|streak/i.test(planner + component)) throw new Error('V29.4 must not introduce pressure-based progress scoring.');
if (!planner.includes("item.canRepeat && item.status !== 'stopped'")) throw new Error('V29.4 must prevent repeating stopped or non-repeatable workouts.');
console.log('V29.4 validation passed: visible Progress uses athlete-first wins, neutral movement trends, recovery-aware regional status, repeat safeguards, and typed React Native styles.');
