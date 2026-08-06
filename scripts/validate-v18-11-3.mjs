import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const required = [
  'apps/mobile/src/theme/index.ts',
  'apps/mobile/src/app/appearance.tsx',
  'apps/mobile/src/state/auth-context.tsx',
  'apps/mobile/src/services/reliability.ts',
  'apps/mobile/src/services/database.ts',
  'supabase/migrations/20260723210000_v18_11_3_sport_theme_ids.sql',
  'docs/V18_11_3_SPORT_ENVIRONMENTS.md',
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`Missing ${file}`);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (file, tokens) => { const text = read(file); for (const token of tokens) if (!text.includes(token)) failures.push(`${file} is missing ${token}`); };

expect('apps/mobile/src/theme/index.ts', [
  "'summit'", "label: 'Trailhead'", "sport: 'Forest trail running'", "label: 'Summit Run'",
  "label: 'Race Day'", "label: 'Open Water'", "label: 'Alpine Lake'", "label: 'Road Club'",
  "label: 'Aero Lab'", "label: 'Singletrack'", 'getDesignTokens', 'DesignTokens',
]);
const themes = read('apps/mobile/src/theme/index.ts');
if (!themes.includes("id: 'trail'") || !themes.includes("surface: '#FFFEFB'")) failures.push('Trailhead is missing its neutral reading surface');
expect('apps/mobile/src/app/appearance.tsx', [
  'Choose a training environment', 'Training environment', 'previewTokens', 'applyTheme',
  "const categoryOrder = ['General', 'Run', 'Swim', 'Bike'] as const",
]);
expect('apps/mobile/src/state/auth-context.tsx', ['syncProfileWithFallback', '.catch(()=>undefined)']);
expect('apps/mobile/src/services/database.ts', ["'profile_sync'"]);
expect('apps/mobile/src/services/reliability.ts', ['syncProfileWithFallback', "operation.kind==='profile_sync'", 'uploadProfile', "queueReliabilityOperation('profile_sync'"]);
expect('supabase/migrations/20260723210000_v18_11_3_sport_theme_ids.sql', ['profiles_theme_id_check', "'trail'", "'summit'", "'race_day'"]);

if (failures.length) { console.error(`V18.11.3 validation failed (${failures.length}):`); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log('V18.11.3 validation passed: sport environments, neutral reading surfaces, local-first theme application, queued profile sync, and expanded cloud theme IDs.');
