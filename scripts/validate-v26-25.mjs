import fs from 'node:fs';
const required = [
  'packages/planner/src/protected-commitments.ts',
  'packages/planner/src/coaching-workflow-inbox.ts',
  'packages/planner/test/protected-commitments.test.ts',
  'packages/planner/test/coaching-workflow-inbox.test.ts',
  'apps/mobile/src/services/coaching-workflow.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing V26.25 file: ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/protected-commitments.ts', 'utf8');
for (const token of ['ProtectedRecurringCommitment', 'immovable', 'ScheduleProtectionResult', 'CoachingWorkflowInbox']) if (!domain.includes(token)) throw new Error(`Missing V26.25 contract: ${token}`);
for (const token of ['cannot be displaced', 'requiresAthleteOverride', 'Optimization must choose another open time']) if (!planner.includes(token)) throw new Error(`Missing protected commitment safeguard: ${token}`);
if (/node:crypto|node:fs/.test(planner)) throw new Error('Shared planner module contains a Node-only runtime import.');
console.log('V26.25 validation passed: unified coaching workflow and athlete-protected recurring commitments are present.');
