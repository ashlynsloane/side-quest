import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const required = [
  'apps/mobile/assets/images/side-quest-brandmark.png',
  'apps/mobile/src/components/v12-ui.tsx',
  'apps/mobile/src/theme/index.ts',
  'apps/mobile/src/app/(tabs)/_layout.tsx',
  'docs/V18_10_RETRO_MINIMAL_BRAND_SYSTEM.md',
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);

function expect(file, tokens) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const token of tokens) if (!text.includes(token)) failures.push(`${file} is missing ${token}`);
}

expect('apps/mobile/src/components/v12-ui.tsx', [
  'side-quest-wordmark-horizontal.png',
  'brandMasthead',
  'heroRule',
  'cardMark',
  "fontFamily:'monospace'",
]);
expect('apps/mobile/src/theme/index.ts', [
  'Side Quest Classic',
  "navy: '#01234D'",
  "mint: '#A8E6CC'",
]);
if (!/canvas: '#(?:E4EBE3|DCE5DE|D5E1D8)'/.test(fs.readFileSync(path.join(root, 'apps/mobile/src/theme/index.ts'), 'utf8'))) {
  failures.push('apps/mobile/src/theme/index.ts is missing the classic sage canvas');
}
expect('apps/mobile/src/app/(tabs)/_layout.tsx', [
  'focused',
  "fontFamily:'monospace'",
  'borderTopWidth:1.5',
]);

const app = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/app.json'), 'utf8'));
const mobilePackage = JSON.parse(fs.readFileSync(path.join(root, 'apps/mobile/package.json'), 'utf8'));
if (app?.expo?.version !== '0.18.10') failures.push('app.json version is not 0.18.10');
if (mobilePackage.version !== '0.18.10') failures.push('mobile package version is not 0.18.10');

if (failures.length) {
  console.error(`V18.10 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('V18.10 validation passed: retro-minimal masthead, classic palette, outlined cards, restrained hero stitching, card icon treatment, and unified tabs.');
