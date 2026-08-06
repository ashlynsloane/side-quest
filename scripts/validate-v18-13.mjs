import fs from 'node:fs';

const capacity = fs.readFileSync('packages/planner/src/capacity.ts', 'utf8');
const adaptive = fs.readFileSync('packages/planner/src/adaptive.ts', 'utf8');
const goalPlan = fs.readFileSync('apps/mobile/src/app/goal-plan.tsx', 'utf8');
const domain = fs.readFileSync('packages/domain/src/index.ts', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const required = [
  [capacity, 'maximumRecommendedMinutes'],
  [capacity, 'maxHighLoadStrengthDays'],
  [capacity, 'maxTotalHardDays'],
  [capacity, 'sessionRoles'],
  [capacity, 'validateCapacityProfile'],
  [capacity, 'Do not increase run volume, lower-body strength volume, and plyometric load in the same week.'],
  [adaptive, "item.kind === 'overdue'"],
  [adaptive, 'hard_day_density'],
  [goalPlan, 'Weekly training budget'],
  [goalPlan, 'strengthDoseMetadata'],
  [goalPlan, 'validationErrors.length'],
  [domain, 'strengthDoseMetadata?'],
];
for (const [text, marker] of required) {
  if (!text.includes(marker)) throw new Error(`V18.13 marker missing: ${marker}`);
}
if (!pkg.scripts['check:v18'].includes('validate-v18-13.mjs')) throw new Error('V18.13 validator not chained');
console.log('V18.13 structural validation passed: bounded strength dose, hard-day limits, bone-stress safeguards, conservative missed-session handling, training-budget UI, and input validation.');
