import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'apps/mobile/src/ui/v29/SideQuestWorkspaceRoot.tsx',
  'apps/mobile/src/ui/v29/workspace-root-spec.ts',
  'apps/mobile/src/services/visible-workspace-root.ts',
];

for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) {
    throw new Error(`V29.7.1 missing ${rel}`);
  }
}

const source = fs.readFileSync(path.join(root, required[0]), 'utf8');
for (const text of [
  'useState<SideQuestPrimaryTab>',
  'buildMobileShellState',
  'routeName: activeTab',
  'buildMobileVisibleTodayScreen',
  'buildMobileVisibleTrainWorkspace',
  'buildMobileVisiblePlanWorkspace',
  'createVisibleProgressWorkspace',
  'createVisibleYouWorkspace',
  '<SideQuestWorkspaceShell',
  'handlers.tabChanged?.(tab)',
]) {
  if (!source.includes(text)) {
    throw new Error(`V29.7.1 root missing ${text}`);
  }
}

if (/buildMobileShellState\(\{[\s\S]{0,180}?\n\s*activeTab,/.test(source)) {
  throw new Error('V29.7.1 still passes the unsupported activeTab property to buildMobileShellState.');
}
if (source.includes('expo-router')) {
  throw new Error('V29.7.1 must not hard-code router assumptions.');
}

console.log('V29.7.1 validation passed: the controlled workspace tab is adapted through the existing routeName shell contract, and all five canonical workspace models still flow through one runtime root.');
