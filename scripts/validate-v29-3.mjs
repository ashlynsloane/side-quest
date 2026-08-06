import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const required = [
  'packages/planner/src/visible-plan-workspace.ts',
  'packages/planner/test/visible-plan-workspace.test.ts',
  'apps/mobile/src/services/visible-plan-workspace.ts',
  'apps/mobile/src/ui/v29/PlanWorkspaceScreen.tsx',
  'apps/mobile/src/ui/v29/plan-screen-spec.ts',
];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) throw new Error(`V29.3 missing ${rel}`);
const domain = fs.readFileSync(path.join(root, 'packages/domain/src/index.ts'), 'utf8');
const plannerIndex = fs.readFileSync(path.join(root, 'packages/planner/src/index.ts'), 'utf8');
const planner = fs.readFileSync(path.join(root, 'packages/planner/src/visible-plan-workspace.ts'), 'utf8');
const component = fs.readFileSync(path.join(root, 'apps/mobile/src/ui/v29/PlanWorkspaceScreen.tsx'), 'utf8');
const spec = fs.readFileSync(path.join(root, 'apps/mobile/src/ui/v29/plan-screen-spec.ts'), 'utf8');
if ((domain.match(/export interface V29PlanVisibleScreenModel/g) ?? []).length !== 1) throw new Error('V29.3 requires exactly one visible Plan screen model.');
if (!plannerIndex.includes("export * from './visible-plan-workspace';")) throw new Error('V29.3 planner export missing.');
for (const phrase of ['Current phase', 'This week', 'Adjust plan', 'Roadmap', 'Open training day']) if (!component.includes(phrase) && !planner.includes(phrase)) throw new Error(`V29.3 missing ${phrase}`);
for (const phrase of ['viewStyles', 'textStyles', 'minimumTapTarget: 44']) if (!(component + spec).includes(phrase)) throw new Error(`V29.3 missing typed UI protection: ${phrase}`);
if (component.includes('const styles = StyleSheet.create')) throw new Error('V29.3 must keep ViewStyle and TextStyle sheets separate.');
if (component.includes("fontWeight: '650'") || component.includes("fontWeight: '750'")) throw new Error('V29.3 contains unsupported React Native font weights.');
if (/completion percentage|consistency score/i.test(planner + component)) throw new Error('V29.3 must not introduce pressure-based completion scoring.');
if (!planner.includes("session.status === 'planned' || session.status === 'proposed'")) throw new Error('V29.3 must gate Move and Edit actions to actionable sessions.');
console.log('V29.3 validation passed: the visible Plan workspace, typed React Native styles, neutral open-day treatment, schedule resolution actions, and roadmap hierarchy are protected.');
