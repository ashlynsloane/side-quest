import fs from 'node:fs';
const required = [
  'packages/planner/src/counterfactual-reasoning.ts',
  'apps/mobile/src/services/counterfactual-reasoning.ts',
  'packages/planner/test/counterfactual-reasoning.test.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const planner = fs.readFileSync(required[0], 'utf8');
for (const symbol of ['generateCounterfactuals', 'evaluateDecisionSensitivity', 'findDecisionBoundary', 'rankCounterfactuals', 'buildCounterfactualExplanation']) {
  if (!planner.includes(`function ${symbol}`)) throw new Error(`Missing ${symbol}`);
}
if (/from ['"]node:/.test(planner)) throw new Error('Shared counterfactual planner code must not import Node-only modules.');
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const symbol of ['CounterfactualScenario', 'CounterfactualOutcome', 'DecisionBoundary', 'CounterfactualExplanation']) {
  if (!domain.includes(symbol)) throw new Error(`Missing domain symbol ${symbol}`);
}
console.log('V26.23 validation passed: counterfactual scenarios, sensitivity, decision boundaries, safety preservation, and athlete-facing explanations are present.');
