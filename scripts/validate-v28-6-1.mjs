import fs from 'node:fs';

const plannerPath = 'packages/planner/src/athlete-first-periodization.ts';
if (!fs.existsSync(plannerPath)) throw new Error(`Missing ${plannerPath}`);
const planner = fs.readFileSync(plannerPath, 'utf8');
for (const phrase of [
  "type SecondarySeasonRace = SeasonRace & { priority: Exclude<RacePriority, 'A'> }",
  'function isSecondaryRace',
  ".filter(isSecondaryRace)",
  'function secondaryAdjustment(race: SecondarySeasonRace',
]) {
  if (!planner.includes(phrase)) throw new Error(`Missing V28.6.1 race-priority narrowing guard: ${phrase}`);
}
if (planner.includes("function secondaryAdjustment(race: SeasonRace")) {
  throw new Error('V28.6.1 still passes an unrestricted A/B/C race into SecondaryRaceAdjustment.');
}
console.log('V28.6.1 validation passed: B/C race adjustments use an explicit type guard, so A-race priority cannot enter the secondary-race contract.');
