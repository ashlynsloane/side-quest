import fs from 'node:fs';

const required = [
  'packages/planner/src/session-archetypes.ts',
  'packages/planner/src/daily-adjustment.ts',
  'packages/planner/test/daily-adjustment.test.ts',
  'apps/mobile/src/app/session-adjustment.tsx',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing V19.2 file: ${file}`);
}
const daily = fs.readFileSync('packages/planner/src/daily-adjustment.ts', 'utf8');
for (const token of ['Mental and physical health take priority', 'buildDailyAdjustmentOptions', 'recentBoneStress', 'availableMinutes', 'skipOption']) {
  if (!daily.includes(token)) throw new Error(`Daily adjustment invariant missing: ${token}`);
}
const archetypes = fs.readFileSync('packages/planner/src/session-archetypes.ts', 'utf8');
for (const token of ['EndurancePrescription', 'minimumRecoveryBeforeNextHardSessionHours', 'assessSessionPair', 'heavy_lower', 'technique']) {
  if (!archetypes.includes(token)) throw new Error(`Session archetype invariant missing: ${token}`);
}
const today = fs.readFileSync('apps/mobile/src/app/today.tsx', 'utf8');
if (!today.includes("router.push('/session-adjustment'")) throw new Error('Today screen does not expose session adjustment.');
console.log('V19.2 structural validation passed: athlete-first daily replanning, time/access/fatigue adjustments, health-first safety stops, endurance archetypes, doubles timing, and session-pair compatibility.');
