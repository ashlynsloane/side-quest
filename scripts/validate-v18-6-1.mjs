#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const requiredFiles = [
  'packages/planner/src/regional-status.ts',
  'packages/planner/test/regional-status.test.ts',
  'apps/mobile/src/services/regional-status.ts',
  'apps/mobile/src/app/insights.tsx',
  'apps/mobile/src/app/training-region.tsx',
  'docs/V18_6_1_REGIONAL_STATUS.md',
];
for (const file of requiredFiles) if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);
function expect(file, tokens) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const token of tokens) if (!text.includes(token)) failures.push(`${file} is missing ${token}`);
}
expect('packages/planner/src/regional-status.ts', [
  'strength_opportunity',
  'sport_loaded_strength_needed',
  'on_plan',
  'review_before_loading',
  'restricted',
  'No universal body-part quota',
  'sport load cannot erase a direct-strength gap',
]);
expect('apps/mobile/src/services/regional-status.ts', [
  'plannedRegionCounts',
  'completedRegionCounts',
  'baselineSportLoad',
  'getTodayReadinessCheckIn',
  'getActiveTrainingCheckIn',
  'getLatestPTProfile',
]);
expect('apps/mobile/src/app/insights.tsx', [
  "useState<MemoryView>('status')",
  'Strength status',
  'Sport load',
  'Symptoms + restrictions',
  'There is no universal body-part percentage target',
  'cannot erase a direct-strength gap',
  'Swim ·',
  'Bike ·',
  'Run ·',
  'does not diagnose overtraining',
]);
expect('apps/mobile/src/components/training-body-map.tsx', [
  'Strength opportunity',
  'Sport-loaded + strength needed',
  'regionChipSportLoaded',
  'warningMark',
]);
expect('apps/mobile/src/app/training-region.tsx', [
  'DIRECT STRENGTH COVERAGE',
  'SPORT LOAD',
  'RECOVERY CONTEXT',
  'It cannot diagnose overtraining',
]);
expect('docs/V18_6_1_REGIONAL_STATUS.md', [
  'Regional Status',
  'A regional percentage has no universal target',
  'Sport-loaded, strength still needed',
]);
const insights = fs.readFileSync(path.join(root, 'apps/mobile/src/app/insights.tsx'), 'utf8');
for (const disallowed of ['Regional exposure', '% of mapped sport load', 'overtrained quadriceps', 'injury risk is high']) {
  if (insights.toLowerCase().includes(disallowed.toLowerCase())) failures.push(`Misleading regional exposure language remains: ${disallowed}`);
}
if (failures.length) {
  console.error(`V18.6.1 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('V18.6.1 validation passed: regional status is plan-relative, sport load is personal-baseline context, and symptoms/restrictions remain separate.');
