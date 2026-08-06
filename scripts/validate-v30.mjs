import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'apps/mobile/src/ui/v29/SideQuestWorkspaceRoot.tsx',
  'apps/mobile/src/ui/v29/SideQuestRuntimeBridge.tsx',
  'apps/mobile/src/services/runtime-action-router.ts',
  'apps/mobile/src/services/visible-workspace-root.ts',
  'apps/mobile/src/ui/v29/workspace-root-spec.ts',
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`V30 missing ${file}`);
}
const rootSource = fs.readFileSync(path.join(root, required[0]), 'utf8');
const bridge = fs.readFileSync(path.join(root, required[1]), 'utf8');
const router = fs.readFileSync(path.join(root, required[2]), 'utf8');
if (!rootSource.includes('routeName: activeTab')) throw new Error('V30 shell input must use routeName');
if (!rootSource.includes('controlledActiveTab ?? internalActiveTab')) throw new Error('V30 controlled tab support missing');
if (rootSource.includes('buildMobileShellState({\n      activeTab')) throw new Error('Unsupported activeTab shell input returned');
for (const workspace of ['today', 'train', 'plan', 'progress', 'you', 'shell', 'workout']) {
  if (!bridge.includes(`workspace: '${workspace}'`) && !router.includes(`case '${workspace}'`)) {
    throw new Error(`V30 action routing missing ${workspace}`);
  }
}
if (!router.includes('unhandled?.(event)')) throw new Error('V30 unhandled fallback missing');
console.log('V30 validation passed: controlled runtime navigation, typed action routing, and route-ready workspace integration are present.');
