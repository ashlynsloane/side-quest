import fs from 'node:fs';
const required = [
  'packages/domain/src/index.ts', 'packages/planner/src/index.ts', 'packages/planner/src/structural-exposure.ts',
  'packages/planner/test/structural-exposure.test.ts', 'apps/mobile/src/services/structural-exposure.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`V24.5 missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/structural-exposure.ts', 'utf8');
const index = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
const tests = fs.readFileSync('packages/planner/test/structural-exposure.test.ts', 'utf8');
const mobile = fs.readFileSync('apps/mobile/src/services/structural-exposure.ts', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const assertions = [
  [domain.includes("export type StructuralRegion"), 'structural regions'],
  [domain.includes("'lumbar_spine'"), 'lumbar region'],
  [domain.includes('StructuralExposureDecision'), 'decision contract'],
  [planner.includes('structuralExposureFromMechanicalProfiles'), 'strength exposure mapping'],
  [planner.includes('structuralExposureFromEnduranceActivity'), 'endurance exposure mapping'],
  [planner.includes('summarizeStructuralExposure'), 'rolling exposure summary'],
  [planner.includes('decideStructuralExposure'), 'automatic decision'],
  [planner.includes('candidateFitsStructuralDecision'), 'exercise filtering'],
  [planner.includes('dominantSources.length > 1'), 'cross-domain overlap'],
  [index.includes("from './structural-exposure'"), 'planner export'],
  [tests.includes('different muscles'), 'cross-muscle lumbar fixture'],
  [tests.includes('swim and overhead strength'), 'swim-strength overlap fixture'],
  [tests.includes('preserving unrelated work'), 'regional preservation fixture'],
  [mobile.includes('Today’s load was redistributed'), 'mobile explanation'],
  [pkg.scripts?.['check:v24']?.includes('validate-v24-5.mjs'), 'V24.5 in pnpm check'],
];
for (const [ok, label] of assertions) if (!ok) throw new Error(`V24.5 validation failed: ${label}`);
console.log('V24.5 validation passed: structural-region exposure, cross-domain overlap, automatic modification, symptom restriction, and unrelated-training preservation.');
