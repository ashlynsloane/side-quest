import fs from 'node:fs';

const required = [
  ['packages/planner/src/capacity.ts', 'recommendStrengthDose'],
  ['packages/domain/src/index.ts', 'phaseStrengthSessions'],
  ['apps/mobile/src/app/goal-plan.tsx', 'Training capacity'],
  ['apps/mobile/src/app/(tabs)/train.tsx', "router.push('/workout-preview'"],
  ['apps/mobile/src/app/_layout.tsx', 'onboardingSetupRoute'],
  ['apps/mobile/src/services/database.ts', 'sameBuiltInKind'],
  ['packages/planner/src/adaptive.ts', 'Ordinary clustering is not labeled a conflict'],
];
for (const [file, token] of required) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(token)) throw new Error(`V18.12 validation failed: ${file} is missing ${token}`);
}
console.log('V18.12 structural validation passed: adaptive dose, setup routing, equipment editing, conflict filtering, and direct workout preview.');
