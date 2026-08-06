import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const required = [
  'apps/mobile/src/components/v12-ui.tsx',
  'apps/mobile/src/app/(tabs)/index.tsx',
  'apps/mobile/src/app/(tabs)/plan.tsx',
  'apps/mobile/src/app/(tabs)/train.tsx',
  'apps/mobile/src/app/(tabs)/profile.tsx',
  'apps/mobile/src/app/goal-plan.tsx',
  'apps/mobile/src/app/insights.tsx',
  'apps/mobile/src/services/regional-status.ts',
  'apps/mobile/src/theme/index.ts',
  'docs/V18_11_2_VISUAL_HIERARCHY_CORRECTION.md',
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function expect(file, tokens) {
  const text = read(file);
  for (const token of tokens) if (!text.includes(token)) failures.push(`${file} is missing ${token}`);
}

expect('apps/mobile/src/components/v12-ui.tsx', [
  'useSafeAreaInsets',
  'height: insets.top + 58',
  "edges={['left','right']}",
  'width:142',
  'export function DisclosureGroup',
]);

const screenFiles = [];
const appRoot = path.join(root, 'apps/mobile/src/app');
for (const entry of fs.readdirSync(appRoot)) {
  if (entry.endsWith('.tsx')) screenFiles.push(path.join(appRoot, entry));
}
for (const file of screenFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (/edges=\{\['top',\s*'left',\s*'right'\]\}/.test(text)) {
    failures.push(`${path.relative(root, file)} still adds duplicate top safe-area padding`);
  }
}

expect('apps/mobile/src/app/(tabs)/index.tsx', [
  'listPlannedCompletedMatches',
  'completedEventIds',
  "done ? '✓ Done' : 'Planned'",
  'StatusBadge',
]);
const home = read('apps/mobile/src/app/(tabs)/index.tsx');
if (home.includes("formatEventTime(event.startAt, event.allDay)")) failures.push('Today still renders repetitive all-day metadata');

expect('apps/mobile/src/services/regional-status.ts', [
  'windowDays: 14 | 28',
  'windowDays: 14 | 28 = 14',
  'const baselineStart = addDays(sportWindowStart, -windowDays)',
]);
expect('apps/mobile/src/app/insights.tsx', [
  'const [windowDays, setWindowDays] = useState<14 | 28>(14)',
  '{([14, 28] as const)',
  'immediately preceding {windowDays} days',
]);

expect('apps/mobile/src/app/goal-plan.tsx', [
  'GOAL_GROUP_TONES',
  '✓ SELECTED',
  'goalDescriptionSelected',
  'backgroundColor: colors.accent',
]);
expect('apps/mobile/src/app/(tabs)/profile.tsx', [
  "label:{fontSize:15",
  'Connections + people',
  'Beta diagnostics',
]);

expect('apps/mobile/src/theme/index.ts', [
  "'trail'",
  "'race_day'",
  "label: 'Trailhead'",
  "label: 'Race Day'",
]);
if (!/canvas: '#(?:E4EBE3|DCE5DE|D5E1D8)'/.test(read('apps/mobile/src/theme/index.ts'))) {
  failures.push('Theme system is missing the stronger classic canvas');
}
expect('apps/mobile/src/app/(tabs)/plan.tsx', ['More planning tools', '<DisclosureGroup']);
expect('apps/mobile/src/app/(tabs)/train.tsx', ['More workout tools', '<DisclosureGroup']);

if (failures.length) {
  console.error(`V18.11.2 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('V18.11.2 validation passed: safe masthead, neutral schedule status, 14/28-day regional windows, stronger selections, additional themes, and reduced menu overload.');
