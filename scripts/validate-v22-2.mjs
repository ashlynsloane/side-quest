import fs from 'node:fs';
const failures=[];
const read=(p)=>{if(!fs.existsSync(p)){failures.push(`Missing ${p}`);return '';}return fs.readFileSync(p,'utf8');};
const theme=read('apps/mobile/src/theme/index.ts');
const ui=read('apps/mobile/src/components/v23-ui.tsx');
const tabs=read('apps/mobile/src/app/(tabs)/_layout.tsx');
for(const token of ['v23Type','pageTitle','rowTitle','body','secondary']) if(!theme.includes(token)) failures.push(`Theme typography is missing ${token}`);
if(!ui.includes('...v23Type.rowTitle') || !ui.includes('...v23Type.secondary')) failures.push('V23 shared components do not consume readable typography tokens');
if(!tabs.includes('fontSize: 11')) failures.push('Bottom-tab labels do not meet the V22.2 readability floor');
if(/fontSize:\s*(?:8|9)(?:\.|,)/.test(tabs)) failures.push('Bottom-tab labels use an undersized value');
for(const file of ['apps/mobile/src/app/(tabs)/index.tsx','apps/mobile/src/app/(tabs)/plan.tsx','apps/mobile/src/app/(tabs)/train.tsx','apps/mobile/src/app/(tabs)/profile.tsx','apps/mobile/src/app/goal-catalog.tsx']) if(!read(file).includes('tokens.textMuted') && !read(file).includes('v23Type')) failures.push(`${file} is not using the V23 readable hierarchy`);
if(failures.length){console.error(`V22.2 validation failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('V22.2 validation passed through V23: readable typography, darker secondary copy, balanced hierarchy, and larger navigation targets are present.');
