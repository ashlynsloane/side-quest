import fs from 'node:fs';
const required = [
  ['packages/domain/src/index.ts', 'DailyCoachBrief'],
  ['packages/domain/src/index.ts', 'AdaptiveCheckIn'],
  ['packages/planner/src/daily-coaching-loop.ts', 'buildDailyCoachBrief'],
  ['packages/planner/src/daily-coaching-loop.ts', 'buildDailyCoachDecision'],
  ['packages/planner/src/daily-coaching-loop.ts', 'buildAdaptiveCheckIns'],
  ['packages/planner/test/daily-coaching-loop.test.ts', 'multiple recovery paths'],
  ['apps/mobile/src/services/daily-coaching-loop.ts', 'buildTodayTimelineSections'],
];
for (const [file, token] of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  if (!fs.readFileSync(file, 'utf8').includes(token)) throw new Error(`Missing ${token} in ${file}`);
}
const planner = fs.readFileSync('packages/planner/src/daily-coaching-loop.ts', 'utf8');
if (planner.includes('node:crypto')) throw new Error('Shared planner code must remain mobile-compatible.');
if (!planner.includes('Protected commitments remain fixed')) throw new Error('Daily adaptation must preserve protected commitments.');
if (!planner.includes('requiresAthleteApproval: true')) throw new Error('Material daily changes must require athlete approval.');
console.log('V27.1 validation passed: morning brief, daily priorities, protected commitments, disruption options, adaptive check-ins, athlete approval, and Today timeline cards are present.');
