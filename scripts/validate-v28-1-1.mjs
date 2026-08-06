import fs from 'node:fs';

const testFile = 'packages/planner/test/today-workspace.test.ts';
if (!fs.existsSync(testFile)) throw new Error(`Missing ${testFile}`);
const source = fs.readFileSync(testFile, 'utf8');
if (!source.includes("from 'vitest'")) throw new Error('Today workspace tests must use the Vitest runner.');
if (source.includes("from 'node:test'")) throw new Error('Obsolete node:test import remains.');
if (!source.includes('describe(') || !source.includes('it(')) throw new Error('Vitest test suite was not registered.');
console.log('V28.1.1 validation passed: Today workspace tests register correctly with Vitest.');
