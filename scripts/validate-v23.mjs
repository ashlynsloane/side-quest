import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const required = [
  'apps/mobile/src/theme/index.ts',
  'apps/mobile/src/state/theme-context.tsx',
  'apps/mobile/src/components/v23-ui.tsx',
  'apps/mobile/src/components/v12-ui.tsx',
  'apps/mobile/src/components/v22-ui.tsx',
  'apps/mobile/src/app/_layout.tsx',
  'apps/mobile/src/app/(tabs)/_layout.tsx',
  'apps/mobile/src/app/(tabs)/index.tsx',
  'apps/mobile/src/app/(tabs)/plan.tsx',
  'apps/mobile/src/app/(tabs)/train.tsx',
  'apps/mobile/src/app/(tabs)/library.tsx',
  'apps/mobile/src/app/(tabs)/profile.tsx',
  'apps/mobile/src/app/appearance.tsx',
  'apps/mobile/src/app/more.tsx',
  'apps/mobile/src/app/readiness.tsx',
  'apps/mobile/src/app/training-intelligence.tsx',
  'apps/mobile/src/app/training-history.tsx',
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);
const read = (file) => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : '';
const expect = (file, tokens) => { const text = read(file); for (const token of tokens) if (!text.includes(token)) failures.push(`${file} is missing ${token}`); };

expect('apps/mobile/src/theme/index.ts', ['export interface DesignTokens','getDesignTokens','headerByTheme','v23Radius','v23Type',"canvas: '#F3F5F2'", "surface: '#FFFFFF'"]);
const themes = read('apps/mobile/src/theme/index.ts');
const lightCanvases = [...themes.matchAll(/canvas: '(#[0-9A-Fa-f]{6})', surface:/g)].map((match) => match[1]);
if (new Set(lightCanvases).size < 7) failures.push('Training environments do not materially change the canvas role');
if (lightCanvases.some((value) => value.toUpperCase() === '#E4EBE3')) failures.push('V23 still hard-codes the former dominant sage canvas');

expect('apps/mobile/src/state/theme-context.tsx', ['tokens: DesignTokens','getDesignTokens(themeId, isDark)','tokens,']);
expect('apps/mobile/src/components/v23-ui.tsx', ['V23BrandHeader','primary ? styles.primaryShell : styles.compactShell','V23PageIntro','V23GroupedList','V23StatusCard','V23SportPill','V23ScenicBanner','tokens.canvas','tokens.surface','dumbbellHandle']);
const v23ui = read('apps/mobile/src/components/v23-ui.tsx');
if (/athlete:\s*\{|torso:\s*\{|sceneStyles\.athlete/.test(v23ui)) failures.push('The V23 strength still-life contains a human character');
if (!v23ui.includes('height: insets.top + (primary ? 48 : 42)')) failures.push('Primary and subpage headers are not intentionally differentiated');
expect('apps/mobile/src/components/v22-ui.tsx',
  'apps/mobile/src/app/_layout.tsx', ['V23BrandHeader','return <V23BrandHeader />']);
expect('apps/mobile/src/components/v12-ui.tsx', ['showSubpageBar = false','tokens.canvas','tokens.surface','v23Radius']);

const tabChecks = [
  ['apps/mobile/src/app/(tabs)/index.tsx',['V23Screen','Best next move','V23SportPill']],
  ['apps/mobile/src/app/(tabs)/plan.tsx',['V23Card','This week','dayRowToday']],
  ['apps/mobile/src/app/(tabs)/train.tsx',['V23ScenicBanner variant="strength"','Recommended today','V23GroupedList']],
  ['apps/mobile/src/app/(tabs)/library.tsx',['What matters','V23StatusCard','Recent change']],
  ['apps/mobile/src/app/(tabs)/profile.tsx',['V23GroupedList','Appearance','Training environment and display']],
  ['apps/mobile/src/app/(tabs)/_layout.tsx',['tokens.tabBar','tokens.header','V23Icon']],
];
for (const [file, tokens] of tabChecks) expect(file, tokens);

expect('apps/mobile/src/app/appearance.tsx', ['title="Choose a training environment"','previewTokens.canvas','previewTokens.header','previewTokens.surface','Safety and review colors stay consistent','Apply environment']);
expect('apps/mobile/src/app/more.tsx', ['title="Tools"','Planning, workout, review, and account tools.','title: \'Appearance\'']);
const more = read('apps/mobile/src/app/more.tsx');
if (more.includes('Everything has a place')) failures.push('Tools still exposes internal redesign rationale');
if (more.includes('Theme Lab')) failures.push('Tools still uses the developer-facing Theme Lab name');

expect('apps/mobile/src/app/readiness.tsx', ['title="How ready are you today?"','readinessHeadline(preview)','readinessDetail(preview)','Save readiness check-in']);
expect('apps/mobile/src/app/training-intelligence.tsx', ['title="Strength and endurance"','subtitle="Choose how recent endurance training may influence upcoming strength sessions."']);
expect('apps/mobile/src/app/training-history.tsx', ['title="Training history"','Counting rules']);
for (const [file, forbidden] of [
  ['apps/mobile/src/app/training-intelligence.tsx','V18.5 TRAINING INTELLIGENCE'],
  ['apps/mobile/src/app/training-intelligence.tsx','Protect strength without ignoring endurance'],
  ['apps/mobile/src/app/training-history.tsx','One record of what you actually did'],
]) if (read(file).includes(forbidden)) failures.push(`${file} still exposes internal or editorial copy: ${forbidden}`);

if (failures.length) {
  console.error(`V23 validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('V23 validation passed: sport-environment design tokens, neutral default surfaces, compact subpage headers, direct user copy, standardized primary tabs, and person-free strength artwork are present.');
