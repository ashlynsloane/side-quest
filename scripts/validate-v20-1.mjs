import fs from 'node:fs';
const failures=[];
const read=(p)=>{ if(!fs.existsSync(p)){failures.push(`Missing ${p}`); return '';} return fs.readFileSync(p,'utf8'); };
const ui=read('apps/mobile/src/components/v23-ui.tsx') + read('apps/mobile/src/components/v12-ui.tsx');
const today=read('apps/mobile/src/app/(tabs)/index.tsx');
const plan=read('apps/mobile/src/app/(tabs)/plan.tsx');
const train=read('apps/mobile/src/app/(tabs)/train.tsx');
const progress=read('apps/mobile/src/app/(tabs)/library.tsx');
const profile=read('apps/mobile/src/app/(tabs)/profile.tsx');
const goal=read('apps/mobile/src/app/goal-plan.tsx');
if(!ui.includes('side-quest-wordmark-transparent.png') || !ui.includes('wordmark')) failures.push('Branded Side Quest wordmark treatment is missing');
if(!today.includes('Best next move') || today.includes('primaryTitle')) failures.push('Today does not use the concise decision-first structure');
if(!plan.includes('getTrainingCalendarEvents') || !plan.includes('This week')) failures.push('Plan does not show the imported weekly schedule directly');
if(!train.includes('Full-body strength') || !train.includes('Exercise library')) failures.push('Train is not useful without an active plan');
if(/completion percentage/i.test(progress)) failures.push('Completion-percentage language remains');
if(!profile.includes('Training capacity') || !profile.includes('Connections')) failures.push('Profile settings-list architecture is missing');
if(!goal.includes("background: '#FFFFFF'")) failures.push('Goal-plan reading surface is not preserved');
if(failures.length){console.error(`V20.1 validation failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('V20.1 validation passed: direct-data tabs, focused plan setup, branded wordmark, and completion-free Insights language are present.');
