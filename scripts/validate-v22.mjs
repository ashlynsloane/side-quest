import fs from 'node:fs';
const failures=[];
const read=(p)=>{if(!fs.existsSync(p)){failures.push(`Missing ${p}`);return '';}return fs.readFileSync(p,'utf8');};
const v23=read('apps/mobile/src/components/v23-ui.tsx');
const alias=read('apps/mobile/src/components/v22-ui.tsx');
for(const token of ['V23BrandHeader','V23ScenicBanner','V23GroupedList','V23StatusCard']) if(!v23.includes(token)) failures.push(`V23 UI is missing ${token}`);
if(!alias.includes('V23BrandHeader')) failures.push('Legacy V22 masthead does not delegate to V23');
const checks=[
 ['apps/mobile/src/app/(tabs)/_layout.tsx','V23Icon'],
 ['apps/mobile/src/app/(tabs)/index.tsx','Best next move'],
 ['apps/mobile/src/app/(tabs)/plan.tsx','Adaptive strength placement'],
 ['apps/mobile/src/app/(tabs)/train.tsx','Recommended today'],
 ['apps/mobile/src/app/(tabs)/library.tsx','What matters'],
 ['apps/mobile/src/app/(tabs)/profile.tsx','Training capacity'],
 ['apps/mobile/src/app/goal-catalog.tsx','Choose your goal'],
 ['apps/mobile/src/app/sign-in.tsx','V23ScenicBanner'],
];
for(const [file,token] of checks){if(!read(file).includes(token)) failures.push(`${file} is missing ${token}`);}
if(/completion percentage|consistency score|streak/i.test(read('apps/mobile/src/app/(tabs)/library.tsx'))) failures.push('Insights reintroduced judgmental completion, consistency, or streak language');
if(failures.length){console.error(`V22 validation failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('V22 validation passed through V23: branded masthead, athlete-first Today/Plan/Train/Insights, goal selection, profile setup, and restrained navigation are present.');
