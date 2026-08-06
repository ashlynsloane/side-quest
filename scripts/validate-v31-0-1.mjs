import fs from 'node:fs';

const registryPath = 'apps/mobile/src/services/runtime-command-registry.ts';
if (!fs.existsSync(registryPath)) throw new Error(`Missing ${registryPath}`);
const source = fs.readFileSync(registryPath, 'utf8');

const required = [
  'runOptionalId',
  'runRequiredId',
  "resumeWorkout: id => runRequiredId('resume_workout'",
  "startWorkout: id => runOptionalId('start_workout'",
];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`V31.0.1 missing required token: ${token}`);
}

if (source.includes("resumeWorkout: id => runOptionalId('resume_workout'")) {
  throw new Error('V31.0.1 regression: resumeWorkout must use the required-id runner.');
}

console.log('V31.0.1 validation passed: required-ID runtime commands are type-safe.');
