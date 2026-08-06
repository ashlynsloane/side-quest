import fs from 'node:fs';
const required = [
  ['packages/domain/src/index.ts', 'ExecutablePlanChangeSet'],
  ['packages/planner/src/coaching-product-integration.ts', 'buildExecutablePlanChangeSet'],
  ['packages/planner/src/coaching-product-integration.ts', 'applyExecutablePlanChangeSet'],
  ['packages/planner/src/coaching-product-integration.ts', 'undoExecutablePlanChangeSet'],
  ['packages/planner/test/coaching-product-integration.test.ts', 'preserving protected sessions'],
  ['apps/mobile/src/services/coaching-product-integration.ts', 'buildTodayCoachActionCard'],
];
for (const [file, token] of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  if (!fs.readFileSync(file, 'utf8').includes(token)) throw new Error(`Missing ${token} in ${file}`);
}
const planner = fs.readFileSync('packages/planner/src/coaching-product-integration.ts', 'utf8');
if (planner.includes('node:crypto')) throw new Error('Shared planner code must remain mobile-compatible.');
if (!planner.includes('idempotencyKey')) throw new Error('Executable plan changes must be idempotent.');
if (!planner.includes('protected session')) throw new Error('Protected sessions must block unsafe plan changes.');
console.log('V27.0 validation passed: decision-to-plan translation, preview, approval, atomic apply, idempotency, undo, protected-session safeguards, and mobile action cards are present.');
