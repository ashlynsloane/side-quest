import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const required = [
  'apps/mobile/src/app/_layout.tsx',
  'apps/mobile/src/components/v12-ui.tsx',
  'apps/mobile/src/components/training-body-map.tsx',
  'apps/mobile/src/state/auth-context.tsx',
  'apps/mobile/src/app/(tabs)/index.tsx',
  'apps/mobile/src/app/(tabs)/plan.tsx',
  'apps/mobile/src/app/(tabs)/train.tsx',
  'apps/mobile/src/app/(tabs)/library.tsx',
  'apps/mobile/src/app/(tabs)/profile.tsx',
  'apps/mobile/src/app/today.tsx',
  'apps/mobile/src/app/schedule.tsx',
  'docs/V18_11_1_BETA_UI_COHESION.md',
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}
function expect(file, tokens) {
  const text = read(file);
  for (const token of tokens) if (!text.includes(token)) failures.push(`${file} is missing ${token}`);
}

expect('apps/mobile/src/app/_layout.tsx', ['header: () => <BrandMasthead />', 'headerShown: true']);
expect('apps/mobile/src/components/v12-ui.tsx', [
  'export function BrandMasthead',
  'brandHeader = false',
  '/goal plan|training block/i.test(`${eyebrow} ${title}`)',
  'width:112',
]);
expect('apps/mobile/src/state/auth-context.tsx', [
  "anatomyFigure:'woman'|'man'",
  "anatomyFigure:'woman'",
]);
const authContext = read('apps/mobile/src/state/auth-context.tsx');
const reliability = fs.existsSync(path.join(root, 'apps/mobile/src/services/reliability.ts'))
  ? read('apps/mobile/src/services/reliability.ts')
  : '';
if (!authContext.includes('anatomy_figure:next.anatomyFigure') && !reliability.includes('anatomy_figure:anatomyFigure')) {
  failures.push('Cloud profile persistence is missing the anatomy figure');
}
expect('apps/mobile/src/app/(tabs)/profile.tsx', [
  'Weight units',
  'Anatomy-map figure',
  'This setting is separate from weight units.',
]);
expect('apps/mobile/src/components/training-body-map.tsx', [
  'user?.anatomyFigure',
  "options={[['front', 'Front'], ['back', 'Back']]",
]);
const bodyMap = read('apps/mobile/src/components/training-body-map.tsx');
if (bodyMap.includes("options={[['woman', 'Woman'], ['man', 'Man']]")) failures.push('Strength Status still owns the Woman / Man preference');

expect('apps/mobile/src/app/(tabs)/index.tsx', [
  'Today’s schedule',
  'getTrainingCalendarEvents',
  'Open full training schedule',
  'Goal-plan strength',
]);
const dailyCoach = read('apps/mobile/src/app/today.tsx');
if (dailyCoach.includes('Today’s imported calendar')) failures.push('Daily Coach still duplicates the Today calendar');

expect('apps/mobile/src/app/(tabs)/plan.tsx', ['Current block', 'metricRow', 'getLatestTrainingBlock']);
expect('apps/mobile/src/app/(tabs)/train.tsx', ['MOST RECENT', 'listWorkoutLedgerEntries']);
expect('apps/mobile/src/app/(tabs)/library.tsx', ['Last 28 days', 'loadTrainingHistory']);

const progress = read('apps/mobile/src/app/(tabs)/library.tsx');
const profile = read('apps/mobile/src/app/(tabs)/profile.tsx');
if (/Beta Feedback/.test(progress)) failures.push('Progress contains the duplicate Beta Feedback destination');
if ((profile.match(/Send Beta Feedback/g) ?? []).length !== 1) failures.push('Profile must contain exactly one canonical Send Beta Feedback card');

for (const file of ['apps/mobile/src/app/today.tsx', 'apps/mobile/src/app/schedule.tsx', 'apps/mobile/src/app/insights.tsx']) {
  const screen = read(file);
  const hasLegacyRetroPalette = screen.includes("ink: '#01234D'")
    && screen.includes("border: '#164C73'")
    && /background: '#(?:FFF8EB|E4EBE3)'/.test(screen);
  const hasDynamicThemePalette = screen.includes("useTheme")
    && screen.includes('makeStyles(palette)')
    && screen.includes('palette.canvas')
    && screen.includes('palette.ink')
    && screen.includes('palette.border');
  if (!hasLegacyRetroPalette && !hasDynamicThemePalette) {
    failures.push(`${file} is missing either the cohesive retro palette or the active theme palette`);
  }
}

if (failures.length) {
  console.error(`V18.11.1 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('V18.11.1 validation passed: global retro masthead, Today schedule ownership, saved anatomy figure preference, cohesive subpage palette, and live tab dashboards.');
