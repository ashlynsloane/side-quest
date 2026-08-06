import fs from 'node:fs';
const required = [
  'packages/planner/src/athlete-level.ts',
  'packages/planner/test/athlete-level.test.ts',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
}
const source = fs.readFileSync(required[0], 'utf8');
for (const marker of ['assessAthleteLevel', 'currentDays: 28', 'capacityDays: 90', 'contextDays: 365', 'calibrationRecommendation', 'planningProficiency']) {
  if (!source.includes(marker)) throw new Error(`V19.1 marker missing: ${marker}`);
}
const index = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
if (!index.includes("from './athlete-level'")) throw new Error('Athlete-level exports missing.');
console.log('V19.1 athlete calibration structural validation passed.');
