import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function has(relative, pattern, message) {
  assert(pattern.test(read(relative)), message ?? `${relative} is missing ${pattern}`);
}

const appJson = JSON.parse(read('apps/mobile/app.json'));
const mobilePackage = JSON.parse(read('apps/mobile/package.json'));
function isV183OrLater(value) {
  const [major, minor, patch] = String(value ?? '0.0.0').split('.').map(Number);
  return major === 0 && (minor > 18 || (minor === 18 && patch >= 3));
}
assert(isV183OrLater(appJson.expo?.version), 'Expo version must be V18.3 or later.');
assert(isV183OrLater(mobilePackage.version), 'Mobile package version must be V18.3 or later.');

const required = [
  'apps/mobile/src/services/coach.ts',
  'apps/mobile/src/app/coach-access.tsx',
  'apps/mobile/src/app/coach-plan.tsx',
  'packages/planner/src/collaboration.ts',
  'packages/planner/test/collaboration.test.ts',
  'supabase/migrations/20260722210000_v18_3_coach_and_friend_workouts.sql',
];
for (const relative of required) {
  assert(fs.existsSync(path.join(root, relative)), `Missing ${relative}`);
}

has('packages/domain/src/index.ts', /CoachReviewMetadata/, 'Coach review metadata type is missing.');
has('packages/domain/src/index.ts', /FriendWorkoutSubstitution/, 'Friend substitution type is missing.');
has('packages/domain/src/index.ts', /sharedContext\?: SharedWorkoutContext/, 'Shared workout context is missing.');
has('packages/planner/src/collaboration.ts', /publicWorkoutForCollaboration/, 'Coach privacy sanitizer is missing.');
has('packages/planner/src/collaboration.ts', /coachWorkoutConflicts/, 'Private restriction validation is missing.');
has('packages/planner/src/collaboration.ts', /48 \* 60/, 'Combined-workout cap is missing.');
has('apps/mobile/src/services/database.ts', /ledgerSource\?: WorkoutLedgerSource/, 'Canonical Workout Together ledger source is missing.');
has('apps/mobile/src/services/database.ts', /friendSubstitution\?: Omit<FriendWorkoutSubstitution/, 'Friend substitution persistence is missing.');
has('apps/mobile/src/app/workout-room.tsx', /Substitute my next session/, 'Per-athlete substitution control is missing.');
has('apps/mobile/src/app/workout-room.tsx', /Combine selected workouts/, 'Combined friend workout control is missing.');
has('apps/mobile/src/app/coach-access.tsx', /pathname:\s*'\/coach-plan'[\s\S]*as never/, 'Coach-plan navigation must bypass stale generated typed-route declarations safely.');
has('apps/mobile/src/app/workout-room.tsx', /if \(!room\)[\s\S]*<AppScreen[\s\S]*><View \/><\/AppScreen>/, 'Workout-room loading screen must provide AppScreen children.');
has('apps/mobile/src/app\/coach-access.tsx'.replace('\\/','/'), /What stays private/, 'Coach privacy disclosure is missing.');
has('apps/mobile/src/services/integration-runtime.ts', /syncAthleteFuturePlan/, 'Foreground coach-plan sync is missing.');

const migration = read('supabase/migrations/20260722210000_v18_3_coach_and_friend_workouts.sql');
for (const table of ['coach_invites','coach_access_grants','coach_future_sessions','coach_plan_audit','workout_room_candidates']) {
  assert(migration.includes(`public.${table}`), `Migration is missing ${table}.`);
}
assert((migration.match(/enable row level security/g) ?? []).length >= 5, 'RLS is not enabled for every V18.3 table.');
assert(migration.includes('Only the host can choose a lobby workout.'), 'Host-only room selection guard is missing.');
assert(migration.includes("p_session_date < current_date"), 'Coach history edit guard is missing.');
assert(!migration.includes('completed_workouts'), 'Coach cloud schema must not expose completed workout history.');
assert(!migration.includes('heart_rate'), 'Coach cloud schema must not expose heart-rate data.');
assert(!migration.includes('readiness'), 'Coach cloud schema must not expose readiness data.');

console.log('V18.3 structural validation passed.');
