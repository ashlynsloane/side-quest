import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const failures=[];
const today=read('apps/mobile/src/app/(tabs)/index.tsx');
const plan=read('apps/mobile/src/app/(tabs)/plan.tsx');
const progress=read('apps/mobile/src/app/(tabs)/library.tsx');
const icons=read('apps/mobile/src/components/sport-icon.tsx');
const synthesis=read('apps/mobile/src/services/training-synthesis.ts');
if(!icons.includes('SymbolView')||!icons.includes('figure.pool.swim')||!icons.includes('dumbbell.fill')) failures.push('Monochrome sport icon system missing');
if(!synthesis.includes('conciseSessionLabel')||!synthesis.includes('sessionMeaning')||!synthesis.includes('buildTrainingSignals')) failures.push('Decision-layer synthesis helpers missing');
if(!today.includes('WHAT MATTERS NOW')||!today.includes('sessionMeaning')) failures.push('Today does not surface decision meaning');
if(!plan.includes("THIS WEEK’S FOCUS")||!plan.includes('Strength priority')) failures.push('Plan does not distinguish weekly focus and strength role');
if(!progress.includes('Training signals')||!progress.includes('What changed')||!progress.includes('Strava and TrainingPeaks remain the detailed activity record')) failures.push('Progress is still acting as a generic activity archive');
if(/completion percentage/i.test(progress)||/consistency score/i.test(progress)||/streak/i.test(progress)) failures.push('Judgmental completion or streak language remains');
if(failures.length){console.error(`V20.2 validation failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('V20.2 validation passed: icon-led sessions, decision synthesis, strength-first weekly focus, and nonredundant Progress signals are present.');
