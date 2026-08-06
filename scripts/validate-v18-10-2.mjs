import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const required = [
  'apps/mobile/src/components/v12-ui.tsx',
  'apps/mobile/src/app/(tabs)/library.tsx',
  'apps/mobile/src/app/(tabs)/profile.tsx',
  'docs/V18_10_2_ICON_AND_NAVIGATION_CLEANUP.md',
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);
}

const ui = fs.readFileSync(path.join(root, 'apps/mobile/src/components/v12-ui.tsx'), 'utf8');
const progress = fs.readFileSync(path.join(root, 'apps/mobile/src/app/(tabs)/library.tsx'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'apps/mobile/src/app/(tabs)/profile.tsx'), 'utf8');

for (const token of [
  'width:49',
  'styles.lockIcon',
  'styles.feedbackIcon',
  'styles.shareIcon',
  'iconFallbackText',
]) {
  if (!ui.includes(token)) failures.push(`Shared UI is missing ${token}`);
}

if (/Beta Feedback/.test(progress)) failures.push('Progress still contains the duplicate Beta Feedback entry');
if (!/Send Beta Feedback/.test(profile)) failures.push('Profile is missing the canonical Beta Feedback entry');

if (failures.length) {
  console.error(`V18.10.2 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('V18.10.2 validation passed: one feedback destination and larger, consistent retro action icons.');
