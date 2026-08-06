import fs from 'node:fs';
const file = 'packages/planner/test/coach-simulation.test.ts';
if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const test = fs.readFileSync(file, 'utf8');
if (!test.includes("import type { CoachOptimizationCandidate }")) throw new Error('Missing typed coach simulation fixture');
if (!test.includes('const candidate: CoachOptimizationCandidate')) throw new Error('Baseline fixture is not mutable-domain typed');
if (test.includes('} as const;')) throw new Error('Readonly fixture assertion remains');
console.log('V26.18.2 validation passed: coach-simulation test fixtures match mutable domain arrays.');
