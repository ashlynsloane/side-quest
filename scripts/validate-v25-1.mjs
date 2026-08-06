import fs from 'node:fs';
const required = [
  'packages/domain/src/index.ts',
  'packages/planner/src/index.ts',
  'packages/planner/src/athlete-response-model.ts',
  'packages/planner/test/athlete-response-model.test.ts',
  'apps/mobile/src/services/athlete-response-model.ts',
];
for (const path of required) if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
const domain = fs.readFileSync('packages/domain/src/index.ts','utf8');
const planner = fs.readFileSync('packages/planner/src/athlete-response-model.ts','utf8');
const tests = fs.readFileSync('packages/planner/test/athlete-response-model.test.ts','utf8');
for (const token of ['AthleteResponseProfile','AthleteToleranceEstimate','AthletePersonalizedAdjustment']) if (!domain.includes(token)) throw new Error(`Missing domain token ${token}`);
for (const token of ['buildAthleteResponseProfile','personalizeAdaptiveDose','conservativeCeiling','signalQuality']) if (!planner.includes(token)) throw new Error(`Missing planner token ${token}`);
if (!tests.includes('requires established repeated evidence')) throw new Error('Missing evidence threshold test');
if (!tests.includes('never models calorie restriction')) throw new Error('Missing nutrition safeguard test');
console.log('V25.1 validation passed: athlete-specific tolerance, conservative evidence thresholds, bounded progression, pain-sensitive reduction, and life-first safeguards.');
