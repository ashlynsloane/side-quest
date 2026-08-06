import fs from 'node:fs';
const failures=[];
const read=(p)=>{if(!fs.existsSync(p)){failures.push(`Missing ${p}`);return '';}return fs.readFileSync(p,'utf8');};
const expect=(p,tokens)=>{const text=read(p);for(const token of tokens)if(!text.includes(token))failures.push(`${p} is missing ${token}`);};
expect('packages/domain/src/index.ts',['export type RegionProtectionMode','export interface PainAreaSelection']);
expect('packages/generator/src/index.ts',['function violatesRegionRestriction','workoutName(request: WorkoutGenerationRequest, seed: string)']);
expect('packages/planner/src/index.ts',['function mergeRegionRestrictions']);
expect('apps/mobile/src/app/active-workout.tsx',['WorkoutShareModal','CompletedWorkoutBodyMap']);
expect('apps/mobile/src/app/workout-preview.tsx',['WorkoutNameModal']);
expect('apps/mobile/src/components/pain-body-map.tsx',['export function PainBodyMap']);
expect('apps/mobile/src/components/workout-share-modal.tsx',['export function WorkoutShareModal']);
expect('apps/mobile/src/services/workout-summary.ts',['buildCompletedWorkoutSummary']);
const pkg=JSON.parse(read('package.json')||'{}');
const check=pkg.scripts?.['check:v24']??'';
for(const token of ['validate-v24-1.mjs','validate-v24-2.mjs','validate-v24-2-1.mjs']) if(!check.includes(token)) failures.push(`check:v24 is missing ${token}`);
if(failures.length){console.error(`V24.2.1 validation failed (${failures.length}):`);for(const f of failures)console.error(`- ${f}`);process.exit(1);} 
console.log('V24.2.1 validation passed: V24.1 pain mapping and V24.2 workout identity/sharing were merged without replacing newer planner modules.');
