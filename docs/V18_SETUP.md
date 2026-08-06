# Side Quest V18 setup

V18 preserves the V17 strength-planning and Training Memory behavior, then adds an independent endurance integration layer.

## What V18 installs

- Conditional TrainingPeaks/ICS refresh with ETag and Last-Modified support, foreground refresh, persisted sync status, failure backoff, and preservation of the last successful calendar on errors.
- Read-only Strava OAuth using `read,activity:read_all`.
- One-year historical backfill, foreground recovery sync, webhook create/update/delete processing, token refresh, deauthorization, and explicit disconnect cleanup.
- Canonical one-to-one planned-versus-completed matching with `matched`, `ambiguous`, and `unmatched` states.
- Conservative swim/bike/run contributions stored separately from completed strength exposure.
- Snapshot-backed strength replanning after newly imported, meaningful endurance sessions.
- SQLite migrations, Supabase schema/RLS, Edge Functions, deployment scripts, tests, and an installer that automatically rolls back when validation fails.

## Prerequisites

- Existing Side Quest V17 repository.
- Node and pnpm versions compatible with the root `packageManager` field.
- A linked Supabase project with the V12, V13, and V17 schemas already applied.
- Supabase CLI authenticated for that project.
- A Strava API application.

## 1. Configure the Strava application

Use the Supabase project host as the OAuth callback domain. The callback endpoint is:

```text
https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/strava-oauth-callback
```

V18 requests only:

```text
read,activity:read_all
```

It never requests `activity:write` and never posts or edits Strava activities.

## 2. Configure Edge Function secrets

```bash
cp supabase/.env.v18.example supabase/.env.v18
```

Fill in:

```dotenv
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_VERIFY_TOKEN=...
APP_DEEP_LINK_SCHEME=sidequest
```

Do not commit `supabase/.env.v18`.

## 3. Deploy schema, functions, and webhook

```bash
export SUPABASE_PROJECT_REF="your-project-ref"
export V18_SECRETS_FILE="supabase/.env.v18"
./scripts/deploy-v18-supabase.sh
```

The script:

1. links the Supabase project;
2. applies `supabase/migrations/20260722180000_v18_endurance_integrations.sql`;
3. uploads secrets;
4. deploys all five Strava Edge Functions;
5. creates the Strava webhook subscription when it does not already exist;
6. stores its subscription ID as an Edge Function secret for POST validation.

The callback and webhook functions intentionally have JWT verification disabled because they are entered by Strava. They perform their own state-token or verification-token validation. User-initiated start, sync, and disconnect functions require a valid Supabase session.

## 4. Validate the repository

```bash
pnpm install --frozen-lockfile
pnpm check:v18
pnpm check
```

`pnpm check:v18` adds structural and pure-logic checks. `pnpm check` remains the authoritative full workspace validation.

## 5. Run the app

```bash
pnpm --dir apps/mobile ios
```

In **Profile → Calendar Connection**:

1. add the private TrainingPeaks/ICS URL and sync it once;
2. leave Automatic refresh enabled;
3. sign into a cloud account;
4. connect Strava;
5. review planned/completed match counts and any ambiguous cases.

## Runtime behavior

### TrainingPeaks / ICS

The app checks active feeds at startup, every 15 minutes while active, and when returning to the foreground. A feed is fetched only when its configured interval/backoff says it is due. `304 Not Modified` is recorded as a successful check. Failed refreshes retain the last successful events.

### Strava

OAuth callback stores credentials in RLS-protected service tables and starts historical backfill. Webhook POSTs must carry the configured subscription ID and a recent event timestamp. Accepted events acknowledge quickly, then process create/update/delete/deauthorization events in the Edge Runtime. The mobile app pulls canonical cloud rows into SQLite at startup/foreground and performs a recovery sync when its last successful sync is stale.

### Matching

Matching is discipline-specific and one-to-one. Exact external IDs win. Otherwise, date/time, title, and duration are scored. A candidate is accepted only when its score and margin over the second-best candidate are high enough. Uncertain candidates remain `ambiguous`.

### Training Memory

Strength exposure is unchanged and remains the only input to exercise-specific progression. Endurance activities produce capped, lower-confidence, sport-specific contributions. The UI can show combined context or strength-only memory, and direct-strength gaps are always computed from strength exposure alone.

### Automatic replanning

Only a newly imported, meaningful endurance completion can trigger the V18 replan path. The app:

1. evaluates same-day and next-day future strength sessions;
2. searches for a safer date inside the same plan week;
3. saves the complete pre-change block as a snapshot;
4. applies the move;
5. records the trigger and moved session IDs;
6. exposes one-tap undo in Adaptive Plan.

Completed and skipped strength sessions are not rewritten.

## Deletion and privacy behavior

- Strava activity deletion marks the canonical activity deleted and removes its local match/contribution after the next pull.
- Strava deauthorization deletes cloud tokens and cloud activity rows; the mobile foreground recovery path removes the local Strava contribution layer.
- Explicit disconnect attempts Strava deauthorization, removes cloud tokens/activities, and removes local Strava activity contributions.
- TrainingPeaks URLs remain local SQLite data.
- Export and local erase include all new V18 SQLite tables.

## Operational checks

- Confirm the Strava webhook subscription callback points to the current Supabase project.
- Inspect `strava_sync_runs` for backfill/recovery failures.
- Inspect `strava_webhook_events` for idempotency and processing errors.
- Confirm `strava_tokens`, `strava_oauth_states`, and `strava_webhook_events` have RLS enabled and no authenticated-client policies.
- Reauthorize when `strava_connections.status` becomes `reauthorization_required`.
