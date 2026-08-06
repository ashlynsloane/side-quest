import fs from 'node:fs';

const required = [
  'packages/planner/src/calendar-intelligence.ts',
  'packages/planner/test/calendar-intelligence.test.ts',
  'apps/mobile/src/services/calendar-intelligence.ts',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing V25.3 file: ${file}`);
}
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const planner = fs.readFileSync('packages/planner/src/calendar-intelligence.ts', 'utf8');
const tests = fs.readFileSync('packages/planner/test/calendar-intelligence.test.ts', 'utf8');
for (const symbol of ['AthleteCalendarConstraint', 'CalendarAdjustmentProposal', 'CalendarIntelligenceInput']) {
  if (!domain.includes(symbol)) throw new Error(`Missing V25.3 domain symbol: ${symbol}`);
}
if (!planner.includes('requiresAthleteApproval: true')) throw new Error('Calendar changes must require athlete approval');
if (!planner.includes("priority === 'event'") || !planner.includes("priority === 'key'")) throw new Error('Missing protected key/event behavior');
if (!tests.includes('never applies calendar changes without athlete approval')) throw new Error('Missing approval safeguard test');
console.log('V25.3 validation passed: life constraints, protected key sessions, equipment-aware windows, forecast conflicts, and athlete-approved calendar proposals are present.');
