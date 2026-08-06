import fs from 'node:fs';
const required = [
  ['apps/mobile/src/app/(tabs)/_layout.tsx', "title: 'Week'"],
  ['apps/mobile/src/app/(tabs)/_layout.tsx', "title: 'Coach'"],
  ['apps/mobile/src/app/(tabs)/index.tsx', "TODAY'S RECOMMENDATION"],
  ['apps/mobile/src/app/(tabs)/index.tsx', 'Build my week'],
  ['apps/mobile/src/app/(tabs)/coach.tsx', "TODAY'S CALL"],
  ['apps/mobile/src/theme/index.ts', "canvas: '#F7F1E6'"],
];
for (const [file, marker] of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  if (!fs.readFileSync(file, 'utf8').includes(marker)) throw new Error(`Missing Side Quest 2.0 marker in ${file}: ${marker}`);
}
const layout = fs.readFileSync('apps/mobile/src/app/(tabs)/_layout.tsx', 'utf8');
if (!layout.includes('name="library" options={{ href: null }}')) throw new Error('Legacy Progress tab must be hidden from primary navigation.');
console.log('Side Quest 2.0 Phase 1 contract validation passed.');
