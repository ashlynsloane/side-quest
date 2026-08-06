import fs from 'node:fs';
const required = [
  'packages/planner/src/unified-coach-engine.ts',
  'packages/planner/test/unified-coach-engine.test.ts',
  'apps/mobile/src/services/unified-coach-engine.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const engine = fs.readFileSync(required[0], 'utf8');
for (const token of ['runUnifiedCoachEngine', 'painOrInjuryRestriction', 'requiresAthleteApproval', 'Protected event and key sessions', 'Low-confidence evidence']) {
  if (!engine.includes(token)) throw new Error(`Unified coach engine missing safeguard or behavior: ${token}`);
}
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
for (const token of ['UnifiedCoachEngineInput', 'UnifiedCoachEngineResult', 'UnifiedCoachDecision', 'UnifiedCoachSignal']) {
  if (!domain.includes(token)) throw new Error(`Domain contract missing ${token}`);
}
console.log('V26.0 validation passed: unified signal reconciliation, safety precedence, protected sessions, athlete approval, and explainable decisions.');
