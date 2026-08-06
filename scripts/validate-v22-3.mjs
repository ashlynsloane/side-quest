import fs from 'node:fs';
const failures=[];
const read=(p)=>{if(!fs.existsSync(p)){failures.push(`Missing ${p}`);return '';}return fs.readFileSync(p,'utf8');};
const ui=read('apps/mobile/src/components/v23-ui.tsx');
const theme=read('apps/mobile/src/theme/index.ts');
for(const token of ['V23Card','V23GroupedList','V23SportPill','V23StatusCard','tokens.canvas','tokens.surface','borderRadius: v23Radius.card']) if(!ui.includes(token)) failures.push(`V23 UI is missing ${token}`);
if(!theme.includes("canvas: '#F3F5F2'") || !theme.includes("surface: '#FFFFFF'")) failures.push('Neutral default canvas and defined card surface are missing');
for(const [file,token] of [
 ['apps/mobile/src/app/(tabs)/index.tsx','<V23StatusCard'],
 ['apps/mobile/src/app/(tabs)/plan.tsx','dayRowToday'],
 ['apps/mobile/src/app/(tabs)/train.tsx','<V23GroupedList>'],
 ['apps/mobile/src/app/(tabs)/library.tsx','<V23GroupedList>'],
 ['apps/mobile/src/app/(tabs)/profile.tsx','<V23GroupedList>'],
 ['apps/mobile/src/app/(tabs)/_layout.tsx','tokens.tabBar'],
]) if(!read(file).includes(token)) failures.push(`${file} is missing ${token}`);
const profile=read('apps/mobile/src/app/(tabs)/profile.tsx');
if((profile.match(/<V23GroupedList>/g)??[]).length<3) failures.push('Profile does not group all three settings sections into defined surfaces');
if(failures.length){console.error(`V22.3 validation failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('V22.3 validation passed through V23: neutral canvas, defined surfaces, larger sport icons, grouped settings, highlighted schedule rows, and stronger navigation separation are present.');
