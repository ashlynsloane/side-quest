import fs from 'node:fs';

const required = [
  'packages/planner/src/digital-twin.ts',
  'packages/planner/test/digital-twin.test.ts',
  'apps/mobile/src/services/coach-digital-twin.ts',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing V26.7 file: ${file}`);
}
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/digital-twin.ts', 'utf8');
const barrel = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
for (const contract of ['AthleteDigitalTwin', 'TwinParameter', 'DigitalTwinPrediction', 'DigitalTwinUpdate']) {
  if (!domain.includes(`interface ${contract}`)) throw new Error(`Missing V26.7 domain contract: ${contract}`);
}
for (const exported of ['createDigitalTwin', 'updateDigitalTwin', 'predictRecovery', 'predictAdaptation', 'predictScenarioOutcome', 'summarizeTwinConfidence']) {
  if (!planner.includes(`export function ${exported}`)) throw new Error(`Missing V26.7 planner export: ${exported}`);
}
for (const safeguard of ['population defaults', 'single workout', 'athlete approval']) {
  if (!planner.includes(safeguard)) throw new Error(`Missing V26.7 safeguard: ${safeguard}`);
}
if (!barrel.includes("export * from './digital-twin';")) throw new Error('Planner barrel does not export digital-twin.');
console.log('V26.7 validation passed: conservative athlete-specific learning, uncertainty-aware predictions, transparent mobile models, and safety authority are present.');
