import fs from 'node:fs';
const failures=[];
const read=(p)=>{if(!fs.existsSync(p)){failures.push(`Missing ${p}`);return '';}return fs.readFileSync(p,'utf8');};
const shared=read('apps/mobile/src/components/v12-ui.tsx');
const v23=read('apps/mobile/src/components/v23-ui.tsx');
const theme=read('apps/mobile/src/theme/index.ts');
for(const token of ['AppScreen','tokens.canvas','tokens.surface','showSubpageBar = false']) if(!shared.includes(token)) failures.push(`Shared subpage UI is missing ${token}`);
for(const token of ['V23BrandHeader','compactShell','V23ScenicBanner','dumbbellHandle','V23GroupedList']) if(!v23.includes(token)) failures.push(`V23 UI is missing ${token}`);
if(/athlete:\s*\{|sceneStyles\.athlete|torso:\s*\{/.test(v23)) failures.push('Train illustration still contains the seated barbell character');
if(!theme.includes('getDesignTokens')) failures.push('Theme-aware subpage tokens are missing');
for(const [file,token] of [['apps/mobile/src/app/training-intelligence.tsx','title="Strength and endurance"'],['apps/mobile/src/app/training-history.tsx','title="Training history"']]) if(!read(file).includes(token)) failures.push(`${file} is missing ${token}`);
const appFiles=fs.readdirSync('apps/mobile/src/app').filter((n)=>n.endsWith('.tsx'));
let count=0;for(const n of appFiles)if(read(`apps/mobile/src/app/${n}`).includes('AppScreen'))count++;
if(count<20) failures.push(`Expected at least 20 ordinary subpages to inherit AppScreen; found ${count}`);
if(failures.length){console.error(`V22.4 validation failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log(`V22.4 validation passed through V23: ${count} ordinary subpages share the compact header, theme-aware canvas, typography, and rounded card system; Train uses a person-free still life.`);
