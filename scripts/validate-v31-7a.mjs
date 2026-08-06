import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fail = (message) => { console.error(`V31.7A validation failed: ${message}`); process.exit(1); };

const layout = read('apps/mobile/src/app/(tabs)/_layout.tsx');
const theme = read('apps/mobile/src/theme/index.ts');
const ui = read('apps/mobile/src/components/v23-ui.tsx');
const system = read('apps/mobile/src/ui/v31/design-system.ts');

const order = [
  'name="index"',
  'name="train"',
  'name="plan"',
  'name="library"',
  'name="profile"',
];
let last = -1;
for (const token of order) {
  const next = layout.indexOf(token);
  if (next < 0 || next <= last) fail(`canonical tab order missing at ${token}`);
  last = next;
}

for (const label of ["title: 'Today'", "title: 'Train'", "title: 'Plan'", "title: 'Progress'", "title: 'You'"]) {
  if (!layout.includes(label)) fail(`missing canonical label ${label}`);
}
if (!layout.includes('height: 74')) fail('tab bar height token not installed');
if (!theme.includes('card: 22') || !theme.includes('control: 16')) fail('shared radius tokens not installed');
if (!theme.includes('body: { fontSize: 16, lineHeight: 23 }')) fail('readable body typography not installed');
if (!ui.includes('paddingHorizontal: 20') || !ui.includes('paddingBottom: 104')) fail('shared page spacing not installed');
if (!ui.includes('minHeight: 52')) fail('shared button height not installed');
if (!system.includes("humanCoach: 'Human Coach Access'")) fail('canonical terminology contract missing');
if (!system.includes("coach: 'Side Quest Coach'")) fail('Side Quest Coach terminology missing');

console.log('V31.7A validation passed: canonical navigation, shared typography, spacing, cards, controls, masthead, and terminology.');
