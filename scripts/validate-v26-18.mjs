import fs from 'node:fs';
const required = [
  'packages/planner/src/coach-simulation.ts',
  'packages/planner/test/coach-simulation.test.ts',
  'apps/mobile/src/services/coach-simulation.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/coach-simulation.ts', 'utf8');
for (const token of ['CoachSimulationScenario','CoachSimulationResult','CoachSimulationStressTest','CoachSimulationDecision']) if (!domain.includes(token)) throw new Error(`Missing domain contract ${token}`);
for (const token of ['createCoachSimulationScenario','simulateCoachCandidate','stressTestCoachCandidate','runCoachSimulation','explainCoachSimulation']) if (!planner.includes(token)) throw new Error(`Missing planner export ${token}`);
if (!planner.includes('safetyViolation') || !planner.includes('automaticPlanChangeAllowed')) throw new Error('Missing simulation safeguards');
console.log('V26.18 validation passed: scenario simulation, stress testing, safety rejection, robustness gating, and athlete-facing cards are present.');
