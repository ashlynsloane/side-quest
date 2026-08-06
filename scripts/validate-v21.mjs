import fs from 'node:fs';
const failures=[];
const read=(p)=>{if(!fs.existsSync(p)){failures.push(`Missing ${p}`);return '';}return fs.readFileSync(p,'utf8');};
const masthead=read('apps/mobile/src/components/v23-ui.tsx')+read('apps/mobile/src/components/v12-ui.tsx');
const approvedWordmark = masthead.includes('side-quest-wordmark-transparent.png') && (masthead.includes('V23BrandHeader') || masthead.includes('BrandMasthead'));
if(!approvedWordmark) failures.push('Approved Side Quest wordmark treatment is missing');
const checks=[
 ['apps/mobile/src/app/(tabs)/index.tsx','Best next move'],
 ['apps/mobile/src/app/(tabs)/plan.tsx','This week'],
 ['apps/mobile/src/app/(tabs)/train.tsx','Recommended today'],
 ['apps/mobile/src/app/(tabs)/library.tsx','What matters'],
 ['apps/mobile/src/app/(tabs)/library.tsx','Routine activity detail stays in Strava or TrainingPeaks.'],
];
for(const [file,token] of checks){const text=read(file);if(!text.includes(token)) failures.push(`${file} is missing ${token}`);}
if(failures.length){console.error(`V21 validation failed (${failures.length}):`);for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log('V21 validation passed: concise decision surfaces, direct Insight cards, and the approved Side Quest wordmark treatment are present.');
