import fs from 'node:fs';
const file = 'packages/planner/src/coach-scenario-simulator.ts';
if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
const source = fs.readFileSync(file, 'utf8');
for (const token of [
  'const scored: CoachScenarioScore[]',
  'map((candidate): CoachScenarioScore =>',
  'recommended.recommended = true',
]) {
  if (!source.includes(token)) throw new Error(`Missing V26.6.1 mutability contract: ${token}`);
}
if (source.includes('} satisfies CoachScenarioScore;')) {
  throw new Error('Stale literal-narrowing expression remains in scenario simulator.');
}
console.log('V26.6.1 validation passed: scenario scores retain the mutable CoachScenarioScore contract during ranking.');
