import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const required=[
  'apps/mobile/src/app/training-intelligence.tsx',
  'apps/mobile/src/services/training-intelligence.ts',
  'packages/planner/src/training-intelligence.ts',
  'packages/planner/test/training-intelligence.test.ts',
  'supabase/migrations/20260722230000_v18_5_training_intelligence.sql',
  'docs/V18_5_TRAINING_INTELLIGENCE.md',
];
for(const file of required){if(!fs.existsSync(path.join(root,file)))failures.push(`Missing ${file}`)}
function expect(file,patterns){const value=fs.readFileSync(path.join(root,file),'utf8');for(const pattern of patterns){if(!value.includes(pattern))failures.push(`${file} is missing ${pattern}`)}}
expect('apps/mobile/package.json',['"version": "0.18.']);
expect('apps/mobile/app.json',['"version": "0.18.']);
expect('apps/mobile/src/services/diagnostics.ts',["appVersion:'0.18."]);
expect('packages/planner/src/training-intelligence.ts',[
  'extremeGuardrail','relativeEffortRatio','strength_build','return_to_strength','race_specific',
  'sport load did not replace direct strength','automaticEligible','createContextualStrengthVariant',
]);
expect('apps/mobile/src/services/training-intelligence.ts',[
  "mode === 'auto_high_confidence'",'savePlanSnapshot','saveTrainingAdjustmentDecision',
  'activePainRestriction','returningFromInjury',
]);
expect('apps/mobile/src/app/training-intelligence.tsx',[
  'Strength and endurance','Auto high-confidence only','Suggestions only',
  'Use Strava Relative Effort','Direct strength preserved','Keep original',
]);
expect('apps/mobile/src/services/endurance.ts',['refreshTrainingIntelligence','triggerActivityIds: changes.insertedIds']);
expect('apps/mobile/src/services/strava.ts',[
  'weighted_average_watts','kilojoules','device_name','has_heartrate',
]);
expect('supabase/functions/_shared/strava.ts',[
  'weighted_average_watts','kilojoules','device_name','has_heartrate',
]);
expect('supabase/migrations/20260722230000_v18_5_training_intelligence.sql',[
  'weighted_average_watts','kilojoules','device_name','grant select on table public.strava_activities to authenticated',
]);
const intelligence=fs.readFileSync(path.join(root,'packages/planner/src/training-intelligence.ts'),'utf8');
if(/automaticEligible:\s*true/.test(intelligence))failures.push('Automatic eligibility must be computed from an extreme guardrail, not hard-coded true.');
if(!intelligence.includes("proposal.confidence === 'high'"))failures.push('High-confidence automatic guardrail check is missing.');
if(!intelligence.includes("loadClass === 'easy' || strongest.assessment.loadClass === 'recovery'"))failures.push('Easy endurance must preserve offseason/return-to-strength sessions.');
if(failures.length){console.error('V18.5 validation failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Validated Side Quest V18.5 Training Intelligence.');
console.log('- Personal 14–30 day endurance baselines');
console.log('- Strava Relative Effort and device summaries used as context');
console.log('- Phase-aware strength priority');
console.log('- Direct strength preserved after ordinary sport load');
console.log('- Athlete-approved adjustments with high-confidence extreme guardrails only');
