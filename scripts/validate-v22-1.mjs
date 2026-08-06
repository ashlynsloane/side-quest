import fs from 'node:fs';
const failures=[];
const read=(p)=>{if(!fs.existsSync(p)){failures.push(`Missing ${p}`);return '';}return fs.readFileSync(p,'utf8');};
const ui=read('apps/mobile/src/components/v23-ui.tsx');
for(const token of ['side-quest-wordmark-transparent.png','V23Icon','V23SportPill','V23GoalChoiceRow']) if(!ui.includes(token)) failures.push(`apps/mobile/src/components/v23-ui.tsx is missing ${token}`);
for(const [file,token] of [
 ['apps/mobile/src/app/(tabs)/_layout.tsx','<V23Icon'],
 ['apps/mobile/src/app/(tabs)/index.tsx','sportStrip'],
 ['apps/mobile/src/app/(tabs)/train.tsx','Other options'],
 ['apps/mobile/src/app/goal-catalog.tsx','Choose your goal'],
]) if(!read(file).includes(token)) failures.push(`${file} is missing ${token}`);
if(/position:\s*'absolute'/.test(read('apps/mobile/src/app/(tabs)/index.tsx').match(/sportStrip:[^}]*}/s)?.[0] ?? '')) failures.push('Today sport icons use an overlapping absolute layout');
if(failures.length){console.error(`V22.1 validation failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('V22.1 validation passed through V23: transparent branding, native iconography, readable sport pills, and non-overlapping Today content are present.');
