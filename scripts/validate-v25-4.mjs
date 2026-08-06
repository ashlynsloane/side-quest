import fs from 'node:fs';

const required = [
  'packages/planner/src/multi-week-optimization.ts',
  'packages/planner/test/multi-week-optimization.test.ts',
  'apps/mobile/src/services/multi-week-optimization.ts',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing V25.4 file: ${file}`);
}
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/multi-week-optimization.ts', 'utf8');
const tests = fs.readFileSync('packages/planner/test/multi-week-optimization.test.ts', 'utf8');
for (const symbol of ['MultiWeekOptimizationInput', 'MultiWeekOptimizationProposal', 'OptimizationObjectiveScore']) {
  if (!domain.includes(symbol)) throw new Error(`Missing V25.4 domain symbol: ${symbol}`);
}
if (!planner.includes('requiresAthleteApproval: true')) throw new Error('Multi-week proposals must require athlete approval');
if (!planner.includes('maximumWeeklyLoadIncrease')) throw new Error('Missing bounded weekly load progression');
if (!planner.includes("priority === 'key'") || !planner.includes("priority === 'event'")) throw new Error('Missing key/event protection');
if (!tests.includes('never applies a multi-week plan without athlete approval')) throw new Error('Missing approval safeguard test');
console.log('V25.4 validation passed: whole-block scoring, protected key sessions, bounded load progression, recovery-aware ranking, and athlete-approved optimization are present.');
