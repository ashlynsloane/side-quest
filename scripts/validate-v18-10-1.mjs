import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const required = [
  'apps/mobile/assets/images/side-quest-wordmark-horizontal.png',
  'apps/mobile/assets/images/trail-sign-doodle.png',
  'apps/mobile/src/components/v12-ui.tsx',
  'docs/V18_10_1_RETRO_MINIMAL_DETAILS.md',
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);
}

const ui = fs.readFileSync(path.join(root, 'apps/mobile/src/components/v12-ui.tsx'), 'utf8');
for (const token of [
  'side-quest-wordmark-horizontal.png',
  'trail-sign-doodle.png',
  'RetroActionIcon',
  'styles.clipboard',
  'styles.smileFace',
  'heroTrailArt',
]) {
  if (!ui.includes(token)) failures.push(`Shared UI is missing ${token}`);
}

if (ui.includes('{cardMark(title, icon)}')) {
  failures.push('Action cards still render two-letter monograms');
}

const horizontal = fs.statSync(path.join(root, 'apps/mobile/assets/images/side-quest-wordmark-horizontal.png'));
const trail = fs.statSync(path.join(root, 'apps/mobile/assets/images/trail-sign-doodle.png'));
if (horizontal.size < 20_000) failures.push('Horizontal wordmark asset appears incomplete');
if (trail.size < 10_000) failures.push('Trail-sign illustration asset appears incomplete');

if (failures.length) {
  console.error(`V18.10.1 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('V18.10.1 validation passed: one-line wordmark, illustrated action icons, and trail-sign goal-plan detail.');
