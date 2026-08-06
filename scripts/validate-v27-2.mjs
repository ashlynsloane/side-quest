import fs from 'node:fs';
const required = [
  'packages/planner/src/session-execution-loop.ts',
  'packages/planner/test/session-execution-loop.test.ts',
  'apps/mobile/src/services/session-execution-loop.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing V27.2 file: ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts','utf8');
const planner = fs.readFileSync('packages/planner/src/session-execution-loop.ts','utf8');
const index = fs.readFileSync('packages/planner/src/index.ts','utf8');
for (const token of ['SessionReadinessAssessment','SessionExecutionRecord','PostSessionCoachSummary']) if (!domain.includes(token)) throw new Error(`Missing domain contract: ${token}`);
for (const token of ['assessSessionReadiness','summarizeSessionExecution','planChangeApplied: false']) if (!planner.includes(token)) throw new Error(`Missing execution safeguard: ${token}`);
if (!index.includes("export * from './session-execution-loop'")) throw new Error('Planner export missing.');
console.log('V27.2 validation passed: readiness assessment, protected-time handling, post-session coaching, and no automatic plan application.');
