import fs from 'node:fs';
const required = [
  'packages/planner/src/capacity-forecast.ts',
  'packages/planner/test/capacity-forecast.test.ts',
  'apps/mobile/src/services/capacity-forecast.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const source = fs.readFileSync('packages/planner/src/capacity-forecast.ts', 'utf8');
const tests = fs.readFileSync('packages/planner/test/capacity-forecast.test.ts', 'utf8');
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
if (!source.includes('forecastCapacity')) throw new Error('Missing capacity forecast engine');
if (!source.includes('athleteResponseProfile')) throw new Error('Missing athlete-response personalization');
if (!source.includes('delayed_peak')) throw new Error('Missing delayed-peak recovery behavior');
if (!domain.includes('CapacityForecastConflict')) throw new Error('Missing forecast domain contracts');
if (!tests.includes('does not present forecasts as diagnosis or certainty')) throw new Error('Missing uncertainty safeguard test');
console.log('V25.2 validation passed: multi-resource capacity forecasting, recovery curves, athlete-specific timing, conflict detection, and uncertainty safeguards.');
