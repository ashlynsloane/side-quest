import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'packages/planner/src/visible-today-workspace.ts',
  'packages/planner/test/visible-today-workspace.test.ts',
  'apps/mobile/src/services/visible-today-workspace.ts',
  'apps/mobile/src/ui/v29/TodayWorkspaceScreen.tsx',
  'apps/mobile/src/ui/v29/today-screen-spec.ts',
];
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`V29.1.2 missing ${rel}`);
}

const domain = fs.readFileSync(path.join(root, 'packages/domain/src/index.ts'), 'utf8');
const plannerIndex = fs.readFileSync(path.join(root, 'packages/planner/src/index.ts'), 'utf8');
const planner = fs.readFileSync(path.join(root, 'packages/planner/src/visible-today-workspace.ts'), 'utf8');
const test = fs.readFileSync(path.join(root, 'packages/planner/test/visible-today-workspace.test.ts'), 'utf8');
const component = fs.readFileSync(path.join(root, 'apps/mobile/src/ui/v29/TodayWorkspaceScreen.tsx'), 'utf8');

if ((domain.match(/export interface V29TodayVisibleScreenModel/g) ?? []).length !== 1) {
  throw new Error('V29.1.2 requires exactly one visible Today screen model.');
}
if (!plannerIndex.includes("export * from './visible-today-workspace';")) {
  throw new Error('V29.1.2 planner export missing.');
}
for (const phrase of ['Build a workout', 'Take a recovery day', 'Feeling different?', 'Add pain or restriction']) {
  if (!planner.includes(phrase)) throw new Error(`V29.1.2 missing direct Today action: ${phrase}`);
}
for (const phrase of ['Your day', 'Coming up', 'ScrollView', 'ActionRow', 'viewStyles', 'textStyles']) {
  if (!component.includes(phrase)) throw new Error(`V29.1.2 visible component missing ${phrase}`);
}
for (const stale of [
  'sourceLabel: workspace.recommendation.sourceLabel',
  'restrictionLabel: workspace.readiness.restrictionLabel',
  'item.detail',
  'item.statusLabel',
  'item.iconKey',
  'day.dayLabel',
  'day.title',
  'day.detail',
  "state: 'planned'",
]) {
  if (planner.includes(stale) || test.includes(stale)) throw new Error(`V29.1.2 stale Today contract reference: ${stale}`);
}
if (component.includes("fontWeight: '650'") || component.includes("fontWeight: '750'")) {
  throw new Error('V29.1.2 contains unsupported React Native font weights.');
}
if (component.includes('const styles = StyleSheet.create')) {
  throw new Error('V29.1.2 must keep ViewStyle and TextStyle sheets separate.');
}
if (component.includes('View readiness') || component.includes('View recommendation')) {
  throw new Error('V29.1.2 must not collapse Today into reroute cards.');
}

console.log('V29.1.2 validation passed: Today contract alignment and React Native style typing are protected.');
