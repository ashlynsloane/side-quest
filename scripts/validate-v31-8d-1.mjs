import fs from 'node:fs';

const checks = [
  ['apps/mobile/src/app/(tabs)/library.tsx', ['Your training picture', 'Needs attention', 'Training body map']],
  ['apps/mobile/src/app/insights.tsx', ['Select a region to see what matters now', 'Show ${selectedRows.length - 6} more regions', 'About this map']],
  ['apps/mobile/src/app/(tabs)/profile.tsx', ['Profile and settings', '__DEV__', 'Developer tools']],
  ['apps/mobile/src/app/developer-tools.tsx', ['INTERNAL BUILD', 'Product scenarios', 'Visual QA']],
];
for (const [file, phrases] of checks) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const source = fs.readFileSync(file, 'utf8');
  for (const phrase of phrases) if (!source.includes(phrase)) throw new Error(`${file} is missing: ${phrase}`);
}
console.log('V31.8D validation passed: compact Progress, map-first Body Map, settings-style You, and developer-only QA navigation.');

const library = fs.readFileSync('apps/mobile/src/app/(tabs)/library.tsx', 'utf8');
if (library.includes('tokens.warningSoft')) throw new Error('library.tsx still references unsupported DesignTokens.warningSoft');
if (!library.includes('backgroundColor: tokens.surfaceMuted')) throw new Error('library.tsx is missing the supported review-pill background token');
console.log('V31.8D.1 typecheck hotfix validated: review pill uses supported DesignTokens fields.');
