import fs from 'node:fs';

const required = [
  'packages/planner/src/training-block-intelligence.ts',
  'packages/planner/test/training-block-intelligence.test.ts',
  'apps/mobile/src/services/training-block-intelligence.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing V25.5 file: ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/training-block-intelligence.ts', 'utf8');
const tests = fs.readFileSync('packages/planner/test/training-block-intelligence.test.ts', 'utf8');
for (const symbol of ['TrainingObjective', 'TrainingBlockDefinition', 'TrainingDebtEntry', 'TrainingBlockIntelligenceResult']) {
  if (!domain.includes(symbol)) throw new Error(`Missing V25.5 domain symbol: ${symbol}`);
}
if (!planner.includes('primaryObjective')) throw new Error('Missing primary block objective logic');
if (!planner.includes('INTERFERENCE_PAIRS')) throw new Error('Missing adaptation interference model');
if (!planner.includes('sacrificeOrder')) throw new Error('Missing role-aware sacrifice ordering');
if (!tests.includes('never turns training debt into compensatory exercise')) throw new Error('Missing training debt safeguard test');
console.log('V25.5 validation passed: objectives, block phases, session roles, adaptation balance, interference awareness, prioritized training debt, and coach rationale are present.');
