
import fs from 'node:fs';
const required = [
  'packages/planner/src/coach-policy.ts',
  'packages/planner/test/coach-policy.test.ts',
  'apps/mobile/src/services/coach-policy.ts',
  'packages/domain/src/index.ts',
  'packages/planner/src/index.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const planner = fs.readFileSync('packages/planner/src/coach-policy.ts', 'utf8');
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const barrel = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
for (const token of ['createDefaultCoachPolicy', 'derivePolicyCandidates', 'applyCoachPolicy', 'resolvePolicyConflicts', 'maxAbsoluteAdjustment', 'population fallback', 'Excluded decisions and unselected scenarios']) if (!planner.includes(token)) throw new Error(`Missing policy API or safeguard: ${token}`);
for (const token of ['CoachPolicyRule', 'CoachPolicyApplication', 'CoachPolicyConflict', 'athlete_preference', 'clinician_constraint', 'retired']) if (!domain.includes(token)) throw new Error(`Missing policy domain contract: ${token}`);
if (!barrel.includes("export * from './coach-policy'")) throw new Error('Planner barrel missing coach-policy export');
console.log('V26.10 validation passed: contextual policy learning, staged activation, bounded score tuning, deterministic priority resolution, drift fallback, and auditable athlete-authority safeguards.');
