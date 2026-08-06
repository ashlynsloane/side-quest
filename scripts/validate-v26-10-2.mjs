import fs from 'node:fs';

const testPath = 'packages/planner/test/coach-policy.test.ts';
if (!fs.existsSync(testPath)) throw new Error(`Missing ${testPath}`);
const source = fs.readFileSync(testPath, 'utf8');
for (const token of ["from 'vitest'", 'describe(', 'expect(', "test('policy adjustment remains bounded and contextual'"]) {
  if (!source.includes(token)) throw new Error(`Missing Vitest suite token: ${token}`);
}
for (const forbidden of ["from 'node:test'", "from 'node:assert/strict'"]) {
  if (source.includes(forbidden)) throw new Error(`Legacy Node test-runner import remains: ${forbidden}`);
}
console.log('V26.10.2 validation passed: coach-policy tests are registered as a native Vitest suite.');
