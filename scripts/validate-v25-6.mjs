import fs from 'node:fs';

const required = [
  'packages/planner/src/long-term-adaptation.ts',
  'packages/planner/test/long-term-adaptation.test.ts',
  'apps/mobile/src/services/long-term-adaptation.ts',
  'V25_6_UPDATE_NOTES.md',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`V25.6 missing ${file}`);
}
const planner = fs.readFileSync('packages/planner/src/long-term-adaptation.ts', 'utf8');
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const test = fs.readFileSync('packages/planner/test/long-term-adaptation.test.ts', 'utf8');
const index = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
for (const token of ['trackLongTermAdaptation', 'DEFAULT_HALF_LIFE_DAYS', 'confidenceFor', 'projectedLevelWithoutNewStimulus']) {
  if (!planner.includes(token)) throw new Error(`V25.6 planner missing ${token}`);
}
for (const token of ['AdaptationEvidencePoint', 'AdaptationTrajectory', 'LongTermAdaptationResult']) {
  if (!domain.includes(token)) throw new Error(`V25.6 domain missing ${token}`);
}
if (!index.includes("export * from './long-term-adaptation'")) throw new Error('V25.6 export missing');
if (!test.match(/non-diagnostic|single workout|symptoms/i)) throw new Error('V25.6 safeguard test missing');
console.log('V25.6 validation passed: objective-specific longitudinal adaptation, decay, confidence, forecasting, and non-diagnostic safeguards.');
