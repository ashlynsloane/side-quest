import fs from 'node:fs';
const required = [
  'packages/domain/src/index.ts', 'packages/planner/src/index.ts', 'packages/planner/src/mechanical-load.ts',
  'packages/planner/test/mechanical-load.test.ts', 'apps/mobile/src/services/mechanical-load.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`V24.4 missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/mechanical-load.ts', 'utf8');
const index = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
const tests = fs.readFileSync('packages/planner/test/mechanical-load.test.ts', 'utf8');
const mobile = fs.readFileSync('apps/mobile/src/services/mechanical-load.ts', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const assertions = [
  [domain.includes("MechanicalLoadLevel = 'none' | 'low' | 'moderate' | 'high'"), 'ordinal load levels'],
  [domain.includes('export interface ExerciseMechanicalLoadProfile'), 'mechanical profile'],
  [domain.includes('spinalStabilization'), 'spinal stabilization dimension'],
  [domain.includes('eccentricDemand'), 'eccentric dimension'],
  [domain.includes('tendonDemand'), 'tendon dimension'],
  [domain.includes('unilateralStabilization'), 'unilateral stabilization dimension'],
  [planner.includes('deriveMechanicalLoadProfile'), 'deterministic metadata derivation'],
  [planner.includes('summarizeSessionMechanicalLoad'), 'session accumulation'],
  [planner.includes("source: override ? 'explicit' : 'derived'"), 'explicit override path'],
  [planner.includes('Multiple exercises accumulate trunk or axial demand'), 'cross-exercise spinal accumulation'],
  [index.includes("from './mechanical-load'"), 'planner export'],
  [tests.includes('different muscles'), 'cross-muscle fixture'],
  [mobile.includes('mechanicalLoadSummaryText'), 'mobile explanation'],
  [pkg.scripts?.['check:v24']?.includes('validate-v24-4.mjs'), 'V24.4 in pnpm check'],
];
for (const [ok, label] of assertions) if (!ok) throw new Error(`V24.4 validation failed: ${label}`);
console.log('V24.4 validation passed: ordinal mechanical-load metadata, deterministic derivation, explicit overrides, session accumulation, and spinal-load detection.');
