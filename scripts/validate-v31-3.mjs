import fs from 'node:fs';

const file = 'apps/mobile/src/app/active-workout.tsx';
const source = fs.readFileSync(file, 'utf8');
const required = [
  'Recover and record',
  'Pause timer',
  'View demo',
  'prescriptionPill',
  'nextStation',
  'Log this station',
  'Enter reps and weight once per exercise',
  'Saved to training history',
  'End workout',
];
const failures = required.filter((token) => !source.includes(token)).map((token) => `${file} is missing ${token}`);
if (source.includes('% of planned workout')) failures.push('Active workout reintroduced completion-percentage pressure.');
if (failures.length) {
  console.error(`V31.3 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('V31.3 validation passed: timer-first execution, per-exercise logging, compact controls, next-station context, and completion review are present.');
