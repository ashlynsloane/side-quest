import fs from 'node:fs';
const mustContain = (path, terms) => {
  const text = fs.readFileSync(path, 'utf8');
  for (const term of terms) if (!text.includes(term)) throw new Error(`Missing ${term} in ${path}`);
};
mustContain('packages/domain/src/index.ts', ['CausalQuestion', 'CausalThreat', 'MatchedTrainingBlockPair', 'CausalEffectEstimate', 'causalClaimAllowed: false', 'promotionBlocked']);
mustContain('packages/planner/src/causal-evidence.ts', ['createCausalQuestion', 'matchComparableTrainingBlocks', 'estimateMatchedOutcomeDifference', 'assessCausalEvidence', 'does not establish causality', 'cannot bypass athlete, clinician, safety, or governance authority', 'Automatic policy promotion is blocked']);
mustContain('packages/planner/src/index.ts', ["export * from './causal-evidence';"]);
mustContain('apps/mobile/src/services/causal-evidence.ts', ['CausalEvidenceCard', 'Matched observational evidence only; this does not establish causality.', 'toMatchedComparisonCard']);
mustContain('packages/planner/test/causal-evidence.test.ts', ["from 'vitest'", 'never permits a causal claim', 'blocks policy promotion']);
console.log('V26.15 causal evidence guardrails validation passed.');
