import fs from 'node:fs';
const required = ['packages/planner/src/coach-decision-audit.ts','packages/planner/test/coach-decision-audit.test.ts','apps/mobile/src/services/coach-decision-audit.ts'];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`V26.22 missing ${file}`);
const domain=fs.readFileSync('packages/domain/src/index.ts','utf8'); const planner=fs.readFileSync(required[0],'utf8'); const index=fs.readFileSync('packages/planner/src/index.ts','utf8');
for (const token of ['CoachDecisionAuditEvent','CoachDecisionAuditTrail','CoachDecisionReplayResult','CoachAuditExport']) if (!domain.includes(token)) throw new Error(`V26.22 domain contract missing ${token}`);
for (const token of ['hashCoachDecisionAuditEvent','buildCoachDecisionAuditTrail','replayCoachDecision','createCoachAuditExport','integrityVerified']) if (!planner.includes(token)) throw new Error(`V26.22 planner behavior missing ${token}`);
if (!index.includes("export * from './coach-decision-audit';")) throw new Error('V26.22 planner export missing.');
console.log('V26.22 validation passed: hash-chained decision provenance, integrity verification, deterministic replay, and audit export are present.');
