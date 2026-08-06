import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const failures = [];
const required = ['apps/mobile/src/theme/index.ts','apps/mobile/src/app/appearance.tsx','apps/mobile/src/app/insights.tsx','apps/mobile/src/components/v12-ui.tsx','docs/V18_11_5_THEME_ROLES.md'];
for (const file of required) if (!fs.existsSync(path.join(root,file))) failures.push(`Missing ${file}`);
const read = (file) => fs.readFileSync(path.join(root,file),'utf8');
const expect = (file,tokens) => { const text=read(file); for(const token of tokens) if(!text.includes(token)) failures.push(`${file} is missing ${token}`); };
expect('apps/mobile/src/app/appearance.tsx', ["['ACTION', theme.light.forest]","['CANVAS', theme.light.canvas]","['CARD', theme.light.surface]","['ACCENT', theme.light.coral]",'Accent appears in hero underlines and small highlights']);
expect('apps/mobile/src/components/v12-ui.tsx', ['<View style={styles.heroRule} />','backgroundColor:palette.coral']);
expect('apps/mobile/src/app/insights.tsx', ["import { useTheme } from '@/state/theme-context';",'const { palette } = useTheme();','const styles = useMemo(() => makeStyles(palette), [palette]);','backgroundColor: palette.canvas','color: palette.ink','backgroundColor: palette.surfaceMuted']);
const themes=read('apps/mobile/src/theme/index.ts');
if (themes.includes('preview: [')) failures.push('Theme previews still duplicate palette colors instead of rendering semantic roles');
if (!themes.includes("canvas: '#F7F4F2', surface: '#FFFFFF', surfaceMuted: '#EEE9E6', ink: '#2D2729'")) failures.push('Road Club text is not using the neutral charcoal ink role');
if (!themes.includes('export interface DesignTokens') || !themes.includes('getDesignTokens')) failures.push('Semantic design tokens are not defined centrally');
if (failures.length) { console.error(`V18.11.5 validation failed (${failures.length}):`); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log('V18.11.5 validation passed: semantic role previews, visible accent use, neutral Road Club typography, and theme-aware Training Memory.');
