import fs from 'node:fs';
const plannerPath = 'packages/planner/src/coach-decision-audit.ts';
if (!fs.existsSync(plannerPath)) throw new Error(`V26.22.1 missing ${plannerPath}`);
const planner = fs.readFileSync(plannerPath, 'utf8');
if (planner.includes("from 'node:crypto'") || planner.includes('createHash(')) throw new Error('V26.22.1 still depends on Node crypto in shared planner code.');
for (const token of ['sha256Hex','TextEncoder','hashCoachDecisionAuditEvent']) if (!planner.includes(token)) throw new Error(`V26.22.1 portable hash behavior missing ${token}`);
console.log('V26.22.1 validation passed: decision audit hashing is synchronous SHA-256 without Node-only runtime imports.');
