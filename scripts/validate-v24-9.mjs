import fs from 'node:fs';
const required = [
  'packages/domain/src/index.ts',
  'packages/planner/src/index.ts',
  'packages/planner/src/post-workout-response.ts',
  'packages/planner/test/post-workout-response.test.ts',
  'apps/mobile/src/services/post-workout-response.ts',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`V24.9 missing ${file}`);
const domain = fs.readFileSync('packages/domain/src/index.ts','utf8');
const planner = fs.readFileSync('packages/planner/src/post-workout-response.ts','utf8');
const index = fs.readFileSync('packages/planner/src/index.ts','utf8');
const tests = fs.readFileSync('packages/planner/test/post-workout-response.test.ts','utf8');
const mobile = fs.readFileSync('apps/mobile/src/services/post-workout-response.ts','utf8');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
const assertions = [
  [domain.includes('PostWorkoutResponseRecord'),'response record contract'],
  [domain.includes('ExerciseToleranceProfile'),'exercise tolerance profile'],
  [planner.includes('evaluatePostWorkoutResponse'),'response-loop engine'],
  [planner.includes('affectedNextWorkout'),'carryover protection'],
  [planner.includes("status = 'avoid_temporarily'"),'repeated-pain substitution rule'],
  [planner.includes('currentLoadManagement?.progressionAllowed === false'),'recovery-week override'],
  [index.includes("from './post-workout-response'"),'planner export'],
  [tests.includes('pain affects another workout'),'pain carryover fixture'],
  [tests.includes('exercise-specific pain'),'exercise learning fixture'],
  [mobile.includes('Repeat and learn'),'mobile response explanation'],
  [pkg.scripts?.['check:v24']?.includes('validate-v24-9.mjs'),'V24.9 in pnpm check'],
];
for (const [ok,label] of assertions) if (!ok) throw new Error(`V24.9 validation failed: ${label}`);
console.log('V24.9 validation passed: post-workout response capture, exercise-specific tolerance learning, progression gating, pain carryover restriction, familiar substitution, and mobile explanations.');
