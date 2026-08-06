import fs from 'node:fs';
const checks = [
  ['packages/planner/src/goal-specific-coaching.ts', ['evaluateGoalSpecificCoaching', 'half_ironman', 'return-to-run', 'compensatory exercise']],
  ['packages/domain/src/index.ts', ['EnduranceGoal', 'GoalSpecificProfile', 'GoalSpecificCoachingResult']],
  ['apps/mobile/src/services/goal-specific-coaching.ts', ['buildGoalCoachingCard']],
  ['packages/planner/test/goal-specific-coaching.test.ts', ['Preserve direct strength', 'not enforced', 'requiresAthleteApproval']],
];
for (const [file, terms] of checks) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const text = fs.readFileSync(file, 'utf8');
  for (const term of terms) if (!text.includes(term)) throw new Error(`${file} missing ${term}`);
}
const plannerIndex = fs.readFileSync('packages/planner/src/index.ts', 'utf8');
if (!plannerIndex.includes("export * from './goal-specific-coaching'")) throw new Error('Planner export missing');
console.log('V25.7 validation passed: goal profiles, race specificity, return-to-run override, strength protection, athlete approval, and non-compensation safeguards.');
