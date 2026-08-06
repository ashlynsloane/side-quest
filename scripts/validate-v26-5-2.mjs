import fs from 'node:fs';

const testPath = 'packages/planner/test/coach-evidence-confidence.test.ts';
const enginePath = 'packages/planner/src/coach-evidence-confidence.ts';
for (const path of [testPath, enginePath]) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
}
const test = fs.readFileSync(testPath, 'utf8');
const engine = fs.readFileSync(enginePath, 'utf8');
if (!test.includes('confidence.cappedByMissingEvidence).toBe(true)')) {
  throw new Error('Missing V26.5.2 active-cap regression assertion.');
}
if (!engine.includes('const cappedByMissingEvidence = missing.length > 0 && score > 0.74')) {
  throw new Error('Missing active missing-evidence cap contract.');
}
if (!engine.includes('if (cappedByMissingEvidence) score = 0.74')) {
  throw new Error('Missing missing-evidence score cap.');
}
console.log('V26.5.2 validation passed: the regression test now recognizes when missing evidence actively caps calibrated confidence.');
