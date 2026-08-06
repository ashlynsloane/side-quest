import fs from 'node:fs';
const mustContain = (path, terms) => {
  const text = fs.readFileSync(path, 'utf8');
  for (const term of terms) if (!text.includes(term)) throw new Error(`Missing ${term} in ${path}`);
};
mustContain('packages/domain/src/index.ts', ['LongitudinalOutcomeWindow', 'TrainingBlockOutcome', 'StrategyPerformanceReport', 'causalClaimAllowed: false']);
mustContain('packages/planner/src/longitudinal-learning.ts', ['createLongitudinalOutcomeWindow', 'compareTrainingBlocks', 'computeStrategyOutcomes', 'detectOutcomeDrift', 'Observed longitudinal association; not a causal estimate.', 'cannot bypass athlete, clinician, or governance authority']);
mustContain('packages/planner/src/index.ts', ["export * from './longitudinal-learning';"]);
mustContain('apps/mobile/src/services/longitudinal-learning.ts', ['TrainingBlockCard', 'StrategyOutcomeCard', 'Observed association only; this does not establish causality.']);
mustContain('packages/planner/test/longitudinal-learning.test.ts', ["from 'vitest'", 'keeps attribution observational rather than causal', 'does not credit excluded blocks']);
console.log('V26.14 longitudinal outcome learning validation passed.');
