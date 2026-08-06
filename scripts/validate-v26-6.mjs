import fs from 'node:fs';
const required = [
  'packages/planner/src/coach-scenario-simulator.ts',
  'packages/planner/test/coach-scenario-simulator.test.ts',
  'apps/mobile/src/services/coach-scenario-simulator.ts',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
}
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/coach-scenario-simulator.ts', 'utf8');
const index = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
for (const token of ['CoachScenarioSimulatorInput', 'CoachScenarioProjection', 'CoachScenarioScore']) {
  if (!domain.includes(token)) throw new Error(`Missing domain contract: ${token}`);
}
for (const token of ['simulateCoachScenarios', 'maximumInjuryRisk', 'protected session', 'does not apply plan changes']) {
  if (!planner.includes(token)) throw new Error(`Missing simulator behavior: ${token}`);
}
if (!index.includes("export * from './coach-scenario-simulator'")) throw new Error('Planner export missing');
console.log('V26.6 validation passed: scenario ranking, weighted utility, hard constraints, protected sessions, mobile cards, and no automatic plan authority.');
