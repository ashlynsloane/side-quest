import fs from 'node:fs';
const file = 'packages/planner/src/daily-coaching-loop.ts';
if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const planner = fs.readFileSync(file, 'utf8');
if (!planner.includes('ProtectedRecurringCommitment')) throw new Error('Daily coaching must use the existing ProtectedRecurringCommitment domain contract.');
if (/(^|\s)ProtectedCommitment([,;\[\]\s]|$)/m.test(planner)) throw new Error('Obsolete ProtectedCommitment type remains in daily coaching code.');
if (!planner.includes('protectedCommitments?: ProtectedRecurringCommitment[]')) throw new Error('Daily brief input has the wrong protected commitment type.');
console.log('V27.1.1 validation passed: Daily Coaching Loop uses the existing ProtectedRecurringCommitment contract.');
