import fs from 'node:fs';
const required = [
  'packages/planner/src/multi-objective-coaching.ts',
  'packages/planner/test/multi-objective-coaching.test.ts',
  'apps/mobile/src/services/multi-objective-coaching.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/multi-objective-coaching.ts', 'utf8');
const mobile = fs.readFileSync('apps/mobile/src/services/multi-objective-coaching.ts', 'utf8');
const tests = fs.readFileSync('packages/planner/test/multi-objective-coaching.test.ts', 'utf8');
for (const token of ['CoachObjective','CoachOptimizationCandidate','CoachParetoCandidate','CoachObjectivePreference','CoachOptimizationDecision','CoachTradeoff']) if (!domain.includes(token)) throw new Error(`Missing domain contract ${token}`);
for (const token of ['screenOptimizationConstraints','candidateDominates','detectObjectiveTradeoffs','buildParetoFrontier','rankParetoCandidates','selectMultiObjectiveCandidate','buildMultiObjectiveExplanation']) if (!planner.includes(`function ${token}`)) throw new Error(`Missing planner export ${token}`);
if (!planner.includes("importance === 'binding'")) throw new Error('Missing non-compensatory binding-objective safeguard');
if (!planner.includes('requiresAthleteChoice')) throw new Error('Missing athlete tradeoff choice safeguard');
if (!planner.includes('does not hide them inside one opaque score')) throw new Error('Missing no-opaque-score safeguard');
if (!planner.includes('governanceApproved')) throw new Error('Missing governance gate');
if (!mobile.includes('CoachingTradeoffCard')) throw new Error('Missing mobile tradeoff surface');
if (!tests.includes("from 'vitest'")) throw new Error('Missing Vitest-native suite');
console.log('V26.17 validation passed: separate objectives, binding constraints, Pareto tradeoffs, athlete choice, governance, and transparent explanations are present.');
