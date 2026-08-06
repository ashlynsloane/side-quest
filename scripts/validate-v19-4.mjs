import fs from 'node:fs';
const failures=[];
const read=(p)=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):(failures.push(`Missing ${p}`),'');
const today=read('apps/mobile/src/app/(tabs)/index.tsx');
const train=read('apps/mobile/src/app/(tabs)/train.tsx');
const plan=read('apps/mobile/src/app/(tabs)/plan.tsx');
const progress=read('apps/mobile/src/app/(tabs)/library.tsx');
const schedule=read('apps/mobile/src/app/schedule.tsx');
const ui=read('apps/mobile/src/components/v12-ui.tsx');
for(const [source,token,label] of [
 [today,'buildRows','canonical Today rows'],[schedule,"match?.status === 'ambiguous'",'review-state matching'],[today,"router.push('/workout-preview'",'direct strength preview'],
 [train,'setPreviewWorkout(next.workout)','Train direct workout routing'],[plan,'Why this week?','weekly explanation'],[progress,'Training trends','compact progress heading'],
 [schedule,'visibleEvents','collapsed matched plan events'],[schedule,"pathname: '/activity-review'",'match review routing'],[ui,'compactHeader','compact header support']]) if(!source.includes(token)) failures.push(`Missing ${label}`);
if(failures.length){console.error(`V19.4 validation failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('V19.4 validation passed: collapsed activity matching, direct workout routing, compact Strava-inspired hierarchy, and simplified Today/Plan/Train/Progress surfaces.');
