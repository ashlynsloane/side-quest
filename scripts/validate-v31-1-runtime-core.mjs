import fs from 'node:fs';

const required = [
  'apps/mobile/src/ui/v31/runtime-entry-store.ts',
  'apps/mobile/src/ui/v31/SideQuestReactiveRuntime.tsx',
  'apps/mobile/src/ui/v31/index.ts',
  'apps/mobile/src/ui/v30/expo-router-adapter.ts',
  'apps/mobile/src/app/(tabs)/_layout.tsx',
];

const failures = [];
for (const file of required) {
  if (!fs.existsSync(file)) failures.push(`missing ${file}`);
}

const read = file => fs.readFileSync(file, 'utf8');
const store = read(required[0]);
const reactive = read(required[1]);
const exportsFile = read(required[2]);
const adapter = read(required[3]);
const layout = read(required[4]);

for (const token of ['getSnapshot', 'subscribe', 'setSnapshot', 'update']) {
  if (!store.includes(token)) failures.push(`runtime store missing ${token}`);
}
if (!reactive.includes('useSyncExternalStore')) failures.push('reactive runtime missing useSyncExternalStore');
if (!exportsFile.includes('SideQuestReactiveRuntime') || !exportsFile.includes('createSideQuestRuntimeEntryStore')) failures.push('v31 index missing runtime exports');
for (const route of ["today: '/(tabs)'", "train: '/(tabs)/train'", "plan: '/(tabs)/plan'", "progress: '/(tabs)/library'", "you: '/(tabs)/profile'"]) {
  if (!adapter.includes(route)) failures.push(`router adapter missing ${route}`);
}
for (const bad of ["/(tabs)/today", "/(tabs)/progress", "/(tabs)/you"]) {
  if (adapter.includes(bad)) failures.push(`router adapter references nonexistent route ${bad}`);
}
for (const label of ["title: 'Today'", "title: 'Train'", "title: 'Plan'", "title: 'Progress'", "title: 'You'"]) {
  if (!layout.includes(label)) failures.push(`tab layout missing ${label}`);
}

if (failures.length) {
  console.error(`V31.1 runtime core validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('V31.1 runtime core validation passed: reactive entry state, repository-accurate routes, and canonical tab labels are present.');
