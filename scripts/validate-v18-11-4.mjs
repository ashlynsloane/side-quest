import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const failures = [];
const required = ['apps/mobile/src/theme/index.ts','apps/mobile/src/app/appearance.tsx','docs/V18_11_4_PALETTE_DIFFERENTIATION.md'];
for (const file of required) if (!fs.existsSync(path.join(root,file))) failures.push(`Missing ${file}`);
const read = (file) => fs.readFileSync(path.join(root,file),'utf8');
const themeText = read('apps/mobile/src/theme/index.ts');
const appearance = read('apps/mobile/src/app/appearance.tsx');
for (const token of ["category: 'General'","category: 'Run'","category: 'Swim'","category: 'Bike'",'getDesignTokens','headerByTheme']) if (!themeText.includes(token)) failures.push(`apps/mobile/src/theme/index.ts is missing ${token}`);
for (const obsoleteSurface of ['#F4E5C4','#F7F2DE','#FFF3D8','#F6E9CF']) if (themeText.includes(`surface: '${obsoleteSurface}'`)) failures.push(`Text-heavy cards still use yellow surface ${obsoleteSurface}`);
const lightCanvases = [...themeText.matchAll(/canvas: '(#[0-9A-Fa-f]{6})', surface:/g)].map((match) => match[1]);
const lightAccents = [...themeText.matchAll(/forest: '(#[0-9A-Fa-f]{6})', forest2:/g)].map((match) => match[1]);
if (new Set(lightCanvases).size < 7) failures.push('Sport environments do not provide sufficiently differentiated canvas roles');
if (new Set(lightAccents).size < 7) failures.push('Sport environments do not provide sufficiently differentiated action roles');
for (const token of ["const categoryOrder = ['General', 'Run', 'Swim', 'Bike'] as const",'theme.category === category','themeGroupLabel','previewTokens.accent']) if (!appearance.includes(token)) failures.push(`apps/mobile/src/app/appearance.tsx is missing ${token}`);
if (failures.length) { console.error(`V18.11.4 validation failed (${failures.length}):`); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log('V18.11.4 validation passed: differentiated sport palettes, neutral reading surfaces, accent-led theme cards, and sport grouping.');
