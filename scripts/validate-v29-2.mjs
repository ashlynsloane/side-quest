import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const required = [
  'packages/planner/src/visible-train-workspace.ts',
  'packages/planner/test/visible-train-workspace.test.ts',
  'apps/mobile/src/services/visible-train-workspace.ts',
  'apps/mobile/src/ui/v29/TrainWorkspaceScreen.tsx',
  'apps/mobile/src/ui/v29/train-screen-spec.ts',
];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) throw new Error(`V29.2 missing ${rel}`);
const domain = fs.readFileSync(path.join(root, 'packages/domain/src/index.ts'), 'utf8');
const plannerIndex = fs.readFileSync(path.join(root, 'packages/planner/src/index.ts'), 'utf8');
const planner = fs.readFileSync(path.join(root, 'packages/planner/src/visible-train-workspace.ts'), 'utf8');
const component = fs.readFileSync(path.join(root, 'apps/mobile/src/ui/v29/TrainWorkspaceScreen.tsx'), 'utf8');
if ((domain.match(/export interface V29TrainVisibleScreenModel/g) ?? []).length !== 1) throw new Error('V29.2 requires exactly one visible Train screen model.');
if (!plannerIndex.includes("export * from './visible-train-workspace';")) throw new Error('V29.2 planner export missing.');
for (const phrase of ['Build a Side Quest', 'Resume workout', 'Recommended for you', 'Saved and recent']) if (!component.includes(phrase) && !planner.includes(phrase)) throw new Error(`V29.2 missing ${phrase}`);
for (const phrase of ['viewStyles', 'textStyles', 'minimumTapTarget: 44']) {
  const haystack = component + fs.readFileSync(path.join(root, 'apps/mobile/src/ui/v29/train-screen-spec.ts'), 'utf8');
  if (!haystack.includes(phrase)) throw new Error(`V29.2 missing typed UI protection: ${phrase}`);
}
if (component.includes('const styles = StyleSheet.create')) throw new Error('V29.2 must keep ViewStyle and TextStyle sheets separate.');
if (component.includes("fontWeight: '650'") || component.includes("fontWeight: '750'")) throw new Error('V29.2 contains unsupported React Native font weights.');
if (!planner.includes("workout.state === 'unavailable'")) throw new Error('V29.2 must explain unavailable workouts.');
if (!planner.includes('if (workout.canStart)')) throw new Error('V29.2 must gate Start actions by capability.');
console.log('V29.2 validation passed: the visible Train workspace, typed React Native styles, active-workout priority, and action gating are protected.');
