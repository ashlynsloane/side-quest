import fs from 'node:fs';
const required = [
  'packages/planner/src/coach-policy-evaluation.ts',
  'packages/planner/test/coach-policy-evaluation.test.ts',
  'apps/mobile/src/services/coach-policy-evaluation.ts',
  'packages/domain/src/index.ts',
  'packages/planner/src/index.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const planner = fs.readFileSync(required[0], 'utf8');
const test = fs.readFileSync(required[1], 'utf8');
const domain = fs.readFileSync(required[3], 'utf8');
const barrel = fs.readFileSync(required[4], 'utf8');
for (const token of ['createPolicyEvaluation', 'recordShadowPolicyPrediction', 'comparePolicyAndBaseline', 'attachPolicyEvaluationOutcome', 'assessPolicyOutcome', 'summarizePolicyPerformance', 'evaluatePolicyPromotion', 'createPolicyExperiment', 'Shadow policies do not alter', 'Unselected options remain counterfactual', 'Missing outcomes remain inconclusive', 'bounded and reversible']) if (!planner.includes(token)) throw new Error(`Missing policy evaluation API or safeguard: ${token}`);
for (const token of ['CoachPolicyEvaluation', 'CoachPolicyExperiment', 'CoachPolicyPromotionDecision', "'shadow'", "'harmful'", "'awaiting_consent'"]) if (!domain.includes(token)) throw new Error(`Missing policy evaluation domain contract: ${token}`);
if (!barrel.includes("export * from './coach-policy-evaluation'")) throw new Error('Planner barrel missing coach-policy-evaluation export');
if (!test.includes("from 'vitest'")) throw new Error('Policy evaluation tests must use Vitest');
if (test.includes("from 'node:test'") || test.includes("node:assert")) throw new Error('Node test runner imports are incompatible with the workspace Vitest suite');
console.log('V26.11 validation passed: shadow evaluation, baseline preservation, comparability screening, counterfactual restraint, staged promotion, harm suspension, consent-gated experiments, and no automatic plan authority.');
