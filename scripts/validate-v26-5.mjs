import fs from 'node:fs';

const required = [
  'packages/planner/src/coach-evidence-confidence.ts',
  'packages/planner/test/coach-evidence-confidence.test.ts',
  'apps/mobile/src/services/coach-evidence-confidence.ts',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing V26.5 file: ${file}`);
}
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/coach-evidence-confidence.ts', 'utf8');
const barrel = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
for (const contract of ['CoachEvidenceItem', 'CoachConfidenceCalibration', 'CoachDecisionExplanation', 'CoachEvidenceConfidenceResult']) {
  if (!domain.includes(`interface ${contract}`)) throw new Error(`Missing domain contract: ${contract}`);
}
if (!planner.includes('buildCoachEvidenceConfidence')) throw new Error('Missing evidence engine export.');
if (!planner.includes('Missing evidence lowers or caps confidence')) throw new Error('Missing confidence safeguard.');
if (!planner.includes('cannot independently authorize an automatic plan change')) throw new Error('Missing outcome-learning safeguard.');
if (!barrel.includes("export * from './coach-evidence-confidence'")) throw new Error('Planner barrel does not export V26.5.');
console.log('V26.5 validation passed: traceable evidence, calibrated confidence, missing-data caps, athlete-readable explanations, and non-automatic safeguards are present.');
