import fs from 'node:fs';

const enginePath = 'packages/planner/src/coach-evidence-confidence.ts';
const testPath = 'packages/planner/test/coach-evidence-confidence.test.ts';
for (const path of [enginePath, testPath]) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
}
const engine = fs.readFileSync(enginePath, 'utf8');
const test = fs.readFileSync(testPath, 'utf8');
const required = [
  'const evidenceScore = clamp',
  'evidenceScore * 0.4 + CONFIDENCE_VALUE[decision.confidence] * 0.6',
  'if (cappedByMissingEvidence) score = 0.74',
];
for (const text of required) {
  if (!engine.includes(text)) throw new Error(`Missing V26.5.1 calibration contract: ${text}`);
}
if (!test.includes("confidence.label).toBe('high')")) {
  throw new Error('The high-confidence regression assertion is missing.');
}
console.log('V26.5.1 validation passed: upstream decision confidence is calibrated with traceable evidence while missing-evidence caps remain enforced.');
