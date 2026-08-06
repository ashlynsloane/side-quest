# Side Quest V18.3 — Coach Planning and Friend Workout Substitution

## Scope

V18.3 adds two collaboration systems without weakening local privacy or historical integrity.

### Coach access

An athlete can create a one-time coach code. After a coach accepts it:

- the coach can see sanitized future Side Quest strength sessions;
- the coach can change future dates, titles, intended load, exercises, and targets;
- the coach cannot see or change completed workout history;
- the coach cannot see loads used, heart rate, Strava data, TrainingPeaks calendar details, readiness, pain, PT restrictions, or private notes;
- every coach edit is written to an immutable cloud audit table;
- the athlete can revoke access at any time;
- the athlete app validates coach edits against private restrictions before applying them.

Only sanitized workout structure is uploaded. User loads, adaptation notes, current exclusions, recovery context, and recent-load adjustments are stripped before cloud sharing.

### Friend workout substitution

Workout Together now supports:

- each participant offering their next Side Quest session;
- the host choosing either participant's workout;
- the host combining two workouts;
- interleaving stations while removing duplicate exercises;
- a 48-minute work cap for combined sessions;
- each participant independently choosing whether the shared workout is additional or substitutes for their own next planned session;
- preserving separate personal loads, rounds, completion, history, and sensor data.

A substitution changes only the participant's own future plan after they complete the shared session. It never edits the friend's plan or historical records.

## Cloud schema

Migration:

`supabase/migrations/20260722210000_v18_3_coach_and_friend_workouts.sql`

New tables:

- `coach_invites`
- `coach_access_grants`
- `coach_future_sessions`
- `coach_plan_audit`
- `workout_room_candidates`

The migration also extends `workout_rooms` and `workout_room_members` with candidate-selection and per-athlete plan-relation fields.

## Deployment

After the local installer succeeds:

```bash
cd /Users/ashlynsloane/Developer/circuit-generator
npx supabase@latest db push
```

No Edge Function redeployment is required.

## Rollback boundary

The local installer backs up every overwritten file and removes every newly created file on rollback. The cloud migration is additive and intentionally remains in Supabase if the local patch is rolled back; it does not expose private data without active app use and RLS remains enabled.
