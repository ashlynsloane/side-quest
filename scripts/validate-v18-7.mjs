#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const root=process.cwd();const failures=[];const required=['apps/mobile/src/app/beta-status.tsx','apps/mobile/src/services/reliability.ts','supabase/functions/delete-account/index.ts','supabase/migrations/20260723000000_v18_7_reliability_security.sql','docs/V18_7_RELIABILITY_PRIVACY.md'];
for(const file of required)if(!fs.existsSync(path.join(root,file)))failures.push(`Missing ${file}`);
function expect(file,tokens){const text=fs.readFileSync(path.join(root,file),'utf8');for(const token of tokens)if(!text.includes(token))failures.push(`${file} is missing ${token}`)}
const mobilePackage=JSON.parse(fs.readFileSync(path.join(root,'apps/mobile/package.json'),'utf8'));
const versionParts=String(mobilePackage.version??'0.0.0').split('.').map(Number);
if(versionParts[0]!==0||versionParts[1]<18||(versionParts[1]===18&&versionParts[2]<7))failures.push('apps/mobile/package.json must be V18.7 or later');
expect('apps/mobile/src/services/database.ts',['cloud_operation_queue','enqueueCloudOperation','markCloudOperationFailed','getCloudOperationQueueStats']);
expect('apps/mobile/src/services/reliability.ts',['calendar_sync','strava_sync','coach_plan_sync','beta_feedback_upload']);
expect('apps/mobile/src/services/database.ts',['Math.min(8','2**(bounded-1)']);
expect('apps/mobile/src/app/beta-status.tsx',['Retry and reconcile now','Reliable delivery','privacy-safe']);
expect('apps/mobile/src/services/privacy.ts',['deleteSideQuestAccount','delete-account','FunctionsHttpError']);
expect('apps/mobile/src/app/privacy-data.tsx',['DELETE ACCOUNT','Permanently delete account','deleteAllLocalData']);
expect('supabase/functions/delete-account/index.ts',['admin.auth.admin.deleteUser','requireUser','DELETE ACCOUNT']);
expect('supabase/migrations/20260723000000_v18_7_reliability_security.sql',['user_action_rate_limits','assert_user_action_rate_limit','create_coach_invite','send_friend_request']);
expect('apps/mobile/src/services/coach.ts',[".gt('expires_at', new Date().toISOString())"]);
const diagnostics=fs.readFileSync(path.join(root,'apps/mobile/src/services/diagnostics.ts'),'utf8');for(const forbidden of ['athleteName','displayName','email','url:','averageHeartRate','maxHeartRate'])if(diagnostics.includes(forbidden))failures.push(`Diagnostics may expose a forbidden field: ${forbidden}`);
if(failures.length){console.error(`V18.7 validation failed (${failures.length}):`);for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('V18.7 validation passed: retry queue, beta operations, account deletion, expiring coach access, and action rate limits are present.');
