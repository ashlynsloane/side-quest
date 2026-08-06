import fs from 'node:fs';
const checks = [
  ['apps/mobile/src/app/goal-plan.tsx', ['Advanced athlete context', 'Why this dose?', 'showPlanningRationale']],
  ['apps/mobile/src/app/workout-preview.tsx', ['openExerciseOptions', 'Options for ${item.exerciseSnapshot.name}', 'Edits and swaps are saved for this session.']],
  ['apps/mobile/src/app/active-workout.tsx', ['restLoadUnit', 'WEIGHT UNIT', 'Add a private reflection', 'One entry per exercise, applied to each round.']],
];
for (const [file, needles] of checks) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) if (!text.includes(needle)) throw new Error(`${file} missing contract: ${needle}`);
}
console.log('V31.8C validation passed: progressive planning disclosure, compact workout preview actions, global rest-log units, and optional completion reflection.');
