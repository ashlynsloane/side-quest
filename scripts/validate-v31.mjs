import fs from 'node:fs';

const required = [
  'apps/mobile/src/services/runtime-command-registry.ts',
  'apps/mobile/src/services/runtime-memory-storage.ts',
  'apps/mobile/src/services/runtime-route-registry.ts',
  'apps/mobile/src/services/visible-workspace-root.ts',
  'apps/mobile/src/ui/v31/SideQuestLiveRuntime.tsx',
  'apps/mobile/src/ui/v31/SideQuestTabRuntimeHost.tsx',
  'apps/mobile/src/ui/v31/runtime-entry-contract.ts',
  'apps/mobile/src/ui/v31/index.ts',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing V31 file: ${file}`);
}
const live = fs.readFileSync('apps/mobile/src/ui/v31/SideQuestLiveRuntime.tsx', 'utf8');
for (const token of ['SideQuestAppRuntime', 'createExpoRouterAdapter', 'routeNameToPrimaryTab', 'canonical={canonical}']) {
  if (!live.includes(token)) throw new Error(`V31 live runtime missing ${token}`);
}
const hosts = fs.readFileSync('apps/mobile/src/ui/v31/SideQuestTabRuntimeHost.tsx', 'utf8');
for (const tab of ['today', 'train', 'plan', 'progress', 'you']) {
  if (!hosts.includes(`tab="${tab}"`)) throw new Error(`V31 missing ${tab} runtime host`);
}
const registry = fs.readFileSync('apps/mobile/src/services/runtime-route-registry.ts', 'utf8');
if (!registry.includes('/(tabs)/today') || !registry.includes('/train/build') || !registry.includes('/you/privacy')) {
  throw new Error('V31 route registry is incomplete.');
}
console.log('V31 validation passed: live runtime activation, tab hosts, command adapters, session storage adapters, and route registry are present.');
