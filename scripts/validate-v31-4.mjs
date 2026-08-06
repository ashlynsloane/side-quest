import fs from 'node:fs';

const file = 'apps/mobile/src/app/goal-plan.tsx';
const source = fs.readFileSync(file, 'utf8');
const required = [
  'useLocalSearchParams',
  "['Goal', 'Timeline', 'Availability', 'Review']",
  'SELECTED GOAL',
  'Set the timeline and weekly fit',
  'router.replace(\'/goal-catalog\'',
  'Weekly availability',
  'Key endurance sessions',
  'READY TO BUILD',
  'Review and build plan',
];
const failures = required.filter((token) => !source.includes(token)).map((token) => `${file} is missing ${token}`);
if (source.includes('GOAL_GROUPS.map((group, groupIndex)')) failures.push('The duplicated full goal catalog is still rendered inside goal-plan.tsx');
if (failures.length) {
  console.error(`V31.4 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('V31.4 validation passed: goal selection is single-source, the plan flow is staged, and the final plan summary is present.');
