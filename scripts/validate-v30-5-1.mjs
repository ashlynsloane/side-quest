import fs from 'node:fs';

const required = [
  'apps/mobile/src/services/runtime-route-intents.ts',
  'apps/mobile/src/services/runtime-session-store.ts',
  'apps/mobile/src/services/runtime-orchestrator.ts',
  'apps/mobile/src/ui/v30/SideQuestAppRuntime.tsx',
  'apps/mobile/src/ui/v30/expo-router-adapter.ts',
  'apps/mobile/src/services/visible-workspace-root.ts',
];

for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing V30.5.1 file: ${file}`);
}

const intents = fs.readFileSync(required[0], 'utf8');
for (const token of ['start_workout','resume_workout','apply_adjustment','open_training_balance','manage_coach_access']) {
  if (!intents.includes(token)) throw new Error(`Missing route intent coverage: ${token}`);
}
if (!intents.includes("return { kind: 'noop', reason: `Unsupported runtime action: ${event.workspace}` }")) {
  throw new Error('Route-intent resolver must have an explicit terminal fallback return.');
}

const runtime = fs.readFileSync(required[3], 'utf8');
if (!runtime.includes('loadRuntimeSession') || !runtime.includes('createRuntimeOrchestrator')) {
  throw new Error('Runtime host is incomplete.');
}

const adapter = fs.readFileSync(required[4], 'utf8');
for (const route of ['/(tabs)/today','/(tabs)/train','/(tabs)/plan','/(tabs)/progress','/(tabs)/you']) {
  if (!adapter.includes(route)) throw new Error(`Missing tab route: ${route}`);
}

console.log('V30.5.1 validation passed: route intents are total, runtime orchestration is present, and Expo Router mappings are complete.');
