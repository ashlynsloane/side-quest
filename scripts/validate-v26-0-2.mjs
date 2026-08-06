import fs from 'node:fs';

const planner = fs.readFileSync('packages/planner/src/unified-coach-engine.ts', 'utf8');
const test = fs.readFileSync('packages/planner/test/unified-coach-engine.test.ts', 'utf8');

const forbidden = [
  'conflict.conflictId',
  'conflict.sessionId',
  'conflict.explanation',
  'stepHours:',
  'projectedCapacity:',
  'occursAt:',
];
for (const token of forbidden) {
  if (planner.includes(token) || test.includes(token)) {
    throw new Error(`V26.0.2 validation failed: stale capacity-forecast contract token remains: ${token}`);
  }
}
for (const token of ['conflict.id', 'conflict.affectedSessionId', 'conflict.reasons[0]', 'availableCapacity:', 'lowestCapacityByResource:']) {
  if (!planner.includes(token) && !test.includes(token)) {
    throw new Error(`V26.0.2 validation failed: expected capacity-forecast contract token is missing: ${token}`);
  }
}
console.log('V26.0.2 validation passed: Unified Coach Engine matches the CapacityForecastResult contract.');
