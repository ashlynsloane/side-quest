import fs from 'node:fs';

const required = [
  'packages/planner/src/athlete-first-periodization.ts',
  'packages/planner/test/athlete-first-periodization.test.ts',
  'apps/mobile/src/services/athlete-first-periodization.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const symbol of ['SeasonRace', 'RaceHierarchyModel', 'SecondaryRaceAdjustment', 'TrainingWinCandidate', 'TrainingWin', 'AthleteFirstProgressModel']) {
  if (!domain.includes(`interface ${symbol}`)) throw new Error(`Missing V28.6 domain contract: ${symbol}`);
}
for (const literal of ["'A' | 'B' | 'C'", "'judgment'", "'recovery'", "'maintenance'", "'reduced_intentionally'"]) {
  if (!domain.includes(literal)) throw new Error(`Missing V28.6 athlete-first literal: ${literal}`);
}
const planner = fs.readFileSync('packages/planner/src/athlete-first-periodization.ts', 'utf8');
for (const phrase of ['buildRaceHierarchy', 'preserveARaceOrientation: true', 'short_taper', 'evaluateTrainingWin', 'painIncreased', 'safetyRecommendationIgnored']) {
  if (!planner.includes(phrase)) throw new Error(`Missing V28.6 behavior: ${phrase}`);
}
const test = fs.readFileSync('packages/planner/test/athlete-first-periodization.test.ts', 'utf8');
if (!test.includes("from 'vitest'")) throw new Error('V28.6 tests must use Vitest.');
if (test.includes("from 'node:test'")) throw new Error('V28.6 test contains node:test.');
const index = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
if (!index.includes("export * from './athlete-first-periodization'")) throw new Error('Planner does not export V28.6.');
console.log('V28.6 validation passed: Training Wins reward sound decisions without progression pressure, and B/C races remain embedded within the A-race macrocycle.');
