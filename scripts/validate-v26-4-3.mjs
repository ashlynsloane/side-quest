import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const testPath = path.join(root, 'packages/planner/test/coach-attention-queue.test.ts');
const source = fs.readFileSync(testPath, 'utf8');
if (!source.includes("generatedAt: '2026-07-29T23:00:00'")) {
  throw new Error('V26.4.3 quiet-hours test must use a local wall-clock timestamp.');
}
if (source.includes("generatedAt: '2026-07-29T23:00:00.000Z'")) {
  throw new Error('V26.4.3 still uses a UTC timestamp for a local quiet-hours test.');
}
console.log('V26.4.3 validation passed: quiet-hours test is timezone-stable and uses athlete-local wall-clock time.');
