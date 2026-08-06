import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const required=[
  'apps/mobile/src/app/activity-review.tsx',
  'apps/mobile/src/app/coach-review.tsx',
  'apps/mobile/src/app/integration-diagnostics.tsx',
  'apps/mobile/src/services/diagnostics.ts',
  'apps/mobile/src/services/privacy.ts',
  'packages/planner/src/timezone.ts',
  'packages/planner/test/timezone.test.ts',
  'supabase/migrations/20260722220000_v18_4_beta_hardening.sql',
  'docs/V18_4_BETA_HARDENING.md',
];
const failures=[];
for(const file of required){if(!fs.existsSync(path.join(root,file)))failures.push(`Missing ${file}`)}
function expect(file,patterns){const value=fs.readFileSync(path.join(root,file),'utf8');for(const pattern of patterns){if(!value.includes(pattern))failures.push(`${file} is missing ${pattern}`)}}
expect('apps/mobile/package.json',['"version": "0.18.']);
expect('apps/mobile/src/services/calendar-sync.ts',['zonedWallTimeToUtc','timeZone']);
expect('apps/mobile/src/services/endurance.ts',['manualMatchCompletedActivity','dismissPlannedActivityMatch','restoreAutomaticPlannedActivityMatch']);
expect('apps/mobile/src/services/database.ts',["id NOT LIKE 'match_manual_%'",'idempotencyKey']);
expect('apps/mobile/src/services/coach.ts',['proposeCoachFutureSession','applyCoachSessionProposal','undoLatestCoachPlanChange']);
expect('apps/mobile/src/app/coach-review.tsx',['You approve every coach change','Approve and apply to my plan']);
expect('apps/mobile/src/services/workout-together.ts',['confirm_workout_room_plan_relation','set_workout_room_ready_v18_4','start_workout_room_v18_4']);
expect('apps/mobile/src/app/workout-room.tsx',['selectionRevision','CONFIRMATION REQUIRED','Preview']);
expect('apps/mobile/src/app/together-session.tsx',['workout_together:${room.id}:${user.id}']);
expect('apps/mobile/src/services/diagnostics.ts',["appVersion:'0.18.",'PrivacySafeDiagnostics']);
expect('apps/mobile/src/app/privacy-data.tsx',['DELETE CLOUD DATA','deleteCloudSideQuestData']);
expect('supabase/migrations/20260722220000_v18_4_beta_hardening.sql',[
  'coach_session_proposals','expires_at','propose_coach_future_session','review_coach_session_proposal',
  'revoke all on function public.update_coach_future_session','selection_revision',
  'confirm_workout_room_plan_relation','start_workout_room_v18_4','delete_my_sidequest_cloud_data',
]);
const coach=fs.readFileSync(path.join(root,'apps/mobile/src/services/coach.ts'),'utf8');
if(coach.includes("rpc('update_coach_future_session'"))failures.push('Coach client still calls the direct-edit V18.3 RPC.');
const diagnostics=fs.readFileSync(path.join(root,'apps/mobile/src/services/diagnostics.ts'),'utf8');
for(const forbidden of ['athleteName','displayName','email','url:','averageHeartRate','maxHeartRate','lastError:']){
  if(diagnostics.includes(forbidden))failures.push(`Diagnostics may expose a forbidden field: ${forbidden}`);
}
if(failures.length){console.error('V18.4 validation failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Validated Side Quest V18.4 beta hardening.');
console.log('- Athlete-approved coach proposals with expiring access');
console.log('- Explicit Workout Together substitution confirmation');
console.log('- Manual activity, plan, and canonical-workout review');
console.log('- Named-zone ICS conversion');
console.log('- Privacy-safe diagnostics and cloud application-data deletion');
