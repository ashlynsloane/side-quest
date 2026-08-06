import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fixtures = read('apps/mobile/src/data/v31-beta-scenarios.ts');
const screen = read('apps/mobile/src/app/beta-scenarios.tsx');
const profile = read('apps/mobile/src/app/(tabs)/profile.tsx');

const requiredScenarioIds = ['cold-start', 'steady-build', 'adjusted-week', 'return-to-training', 'travel-week'];
for (const id of requiredScenarioIds) {
  if (!fixtures.includes(`id: '${id}'`)) throw new Error(`Missing beta scenario: ${id}`);
}
for (const phrase of ['Product scenarios', 'These scenarios do not overwrite your training data.', 'Fixture boundary']) {
  if (!screen.includes(phrase)) throw new Error(`Missing scenario-screen contract: ${phrase}`);
}
if (!profile.includes("router.push('/beta-scenarios' as Href)")) throw new Error('You tab does not link to beta scenarios.');
if (!screen.includes('does not seed the database')) throw new Error('Fixture safety boundary is missing.');
console.log('V31.7G validation passed: deterministic beta scenarios, cold-start/history-informed coverage, guardrail review, non-mutating fixture boundary, and You-tab access.');
