#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const required = [
  'apps/mobile/src/app/onboarding.tsx',
  'apps/mobile/src/services/onboarding.ts',
  'apps/mobile/src/state/onboarding-context.tsx',
  'docs/V18_8_ONBOARDING_BETA_LAUNCHPAD.md',
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);

function expect(file, tokens) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const token of tokens) if (!text.includes(token)) failures.push(`${file} is missing ${token}`);
}

const mobilePackage = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/package.json'), 'utf8'));
const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/app.json'), 'utf8'));
const versionParts = String(mobilePackage.version ?? '0.0.0').split('.').map(Number);
if (versionParts[0] !== 0 || versionParts[1] < 18 || (versionParts[1] === 18 && versionParts[2] < 8)) failures.push('apps/mobile/package.json must be V18.8 or later');
if (appConfig?.expo?.version !== mobilePackage.version) failures.push('app.json and mobile package versions must match');
expect('apps/mobile/src/app/_layout.tsx', ['OnboardingProvider', 'needsOnboarding', "router.replace('/onboarding'"]);
expect('apps/mobile/src/services/onboarding.ts', [
  'strengthModelAcknowledged',
  'privacyModelAcknowledged',
  'evaluateFirstRun',
  'buildSetupReadiness',
  'firstRunBypassedAt',
]);
expect('apps/mobile/src/state/onboarding-context.tsx', [
  'acknowledgeStrengthModel',
  'acknowledgePrivacyModel',
  'markReviewed',
  'complete',
]);
expect('apps/mobile/src/app/onboarding.tsx', [
  'Endurance informs strength—it does not replace it',
  'Private details stay separated',
  'Adjustment policy',
  'Enter Side Quest',
  'Build your training context',
]);
expect('apps/mobile/src/app/(tabs)/profile.tsx', ['Setup Guide', "r.push('/onboarding'"]);
expect('apps/mobile/src/services/diagnostics.ts', [`appVersion:'${mobilePackage.version}'`]);

const service = fs.readFileSync(path.join(root, 'apps/mobile/src/services/onboarding.ts'), 'utf8');
for (const forbidden of ['averageHeartRate', 'maxHeartRate', 'painNotes', 'privateNotes', 'strava_tokens']) {
  if (service.includes(forbidden)) failures.push(`Onboarding status must not store private training detail: ${forbidden}`);
}

if (failures.length) {
  console.error(`V18.8 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('V18.8 validation passed: first-run routing, setup readiness, strength/privacy acknowledgments, existing-profile bypass, and local-only onboarding state are present.');
