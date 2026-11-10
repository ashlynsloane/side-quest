# Synchronized Training Ledger — Staged Architecture and Release Gate

**Status: implemented in draft code, verified in local PostgreSQL CI, not deployed.**
The cloud gate remains OFF unless `EXPO_PUBLIC_DISTRIBUTED_WORKOUT_LOCKS=true`,
and **both** migrations are applied. This is self-reported training data, not
independently measured physiological load or clinical clearance.

## Goal

A cloud athlete must not get an increased daily training allowance by opening
Side Quest on a second phone. The synchronized start transaction must use
server-stored planned sessions, exercise minutes, completed activities and
regional recovery rather than treating the second phone's SQLite records
as complete history.

## Data model

- `training_remote_plans`: first approved daily session list. Athlete, date,
  session ID, dose in minutes and broad tissue regions. The first snapshot is
  immutable. Revised plans need a **future reviewed amendment protocol**,
  not an automatic client overwrite.
- `training_remote_reservations`: one persistent row per athlete/date/session.
  Created atomically when a lease starts. It conservatively counts the whole
  prescribed session, including when the device crashes, leaves, or fails to
  upload completion. No ordinary client can delete a reservation.
- `training_remote_exposures`: append-only event IDs, activity and minutes,
  anatomical loading regions, UTC completion time, and the athlete's local
  training date. Strength, run, bike, swim and HIIT are currently supported.
  Replays must match exactly or fail; altered local histories do not silently
  erase exposure.
- `training_remote_recovery`: append-only explicitly rechecked regions
  (general, Achilles, upper back) with statuses stable/uncertain/worse/red_flag.
  **Observation timestamps are assigned by PostgreSQL**, so delayed local
  reports cannot claim they preceded other server events.
- `training_workout_leases`: single 90-second active workout token per athlete,
  with its prescribed session, date, regions and intended minutes. Renewals
  re-evaluate new server-side symptoms and subsequent exposure.

Only authenticated, athlete-scoped security-definer RPCs can read or modify
the tables. Ordinary authenticated and anonymous roles have no direct table
permissions. On account erasure, foreign keys cascade the athlete's records.

## Start and completion protocol

1. Evaluate Side Quest's existing local prescription, recovery and recent load
   rules; a local stop is never overridden by remote clearance.
2. Verify current Supabase account identity against the expected athlete.
3. Attempt to publish the athlete's immutable **today** prescription. A changed
   local plan cannot increase an existing server prescription.
4. Strictly load and upload up to **89 days** of the device's recorded
   workouts and endurance imports, using stable, paginated queries and
   immutable event IDs. Upload in batches of at most 100 events within
   atomic PostgreSQL transactions. A failed, conflicting, or partially
   acknowledged batch blocks the next cloud start. This longer window
   supports devices that were offline for weeks, but records older than
   the server's 90-day acceptance limit need a separate archive policy.
5. Call `acquire_training_workout_lease_v2`. In one database transaction it
   locks that athlete's authorization, verifies a matching session and
   remaining allowance, checks completed *and reserved* load, tests regional
   recovery after the most recent possible exposure, and reserves the dose
   while acquiring an exclusive active lease.
6. A cloud workout must continuously renew using the v2 RPC. Worsened
   recovery, other-device exposure or failed renewal pauses the session.
7. When a workout is completed, save the athlete's local history, reconcile
   local guardrail events, then **publish all unsynced recent actuals** before
   reporting cloud completion. Failed upload remains a visible retryable
   error; a later start will retry the same immutable event IDs.
8. A new regional review is published to the server **before** local
   clearance is updated. A durable per-athlete write-ahead event preserves
   the **same event ID** when a network acknowledgement or local save fails,
   preventing a retry from getting a falsely later server timestamp. Only
   after local persistence succeeds is that pending event acknowledged.
   The server rejects changed regions/statuses under an existing event ID.
   Old saved "stable" statuses are never imported as new observations.
9. The daily-ceiling view reads server exposures, reservations and regional
   statuses. Reserved potential minutes and reported actual minutes are
   displayed separately, avoiding double-counting a completed reservation.

Cloud discretionary starts that lack a matched planned session are denied,
even if local policy allowed a documented exception.

## Failure modes and important limits

- **Historical backfill:** a bounded 89-day window can still miss records
  older than 89 days and cannot resolve corrected/deleted historical events.
  More than 5,000 local records in one category is a fail-closed review condition,
  not a silent truncation. An explicit correction and archive workflow is
  required before production enablement.
- **Pending recovery review:** an interrupted recovery upload is held in
  durable local storage and must be retried with the same region/status values
  before a new distinct symptom report can be submitted. This avoids
  rewriting older observations as newly observed timestamps.
- **Disconnected other phone:** exposure performed fully offline on phone A
  cannot be visible to server or phone B until A reconnects and uploads.
  A server reservation protects an authorized Side Quest session, but it
  cannot detect unlogged physical activity or activity from older builds
  that did not follow this protocol.
- **Device without this flag:** local-only profiles and older builds are not
  guaranteed synchronized. The v1 acquire RPC is revoked in the new SQL
  migration to stop older enabled cloud clients from bypassing dose checks.
- **Reservation conservatism:** leaving a workout with no actual loading still
  reserves its full prescribed minutes and session identity. Safe review,
  corrected data and plan amendment are future explicit workflows.
- **Plan bootstrap:** a device needs the matching local scheduled workout to
  publish or use the immutable remote plan; full plan-download/reconciliation
  UX is not implemented.
- **Imported training:** a connected source is converted to a conservative
  regional overlap category, not to a validated tissue-stress score.
  Existing local data edits/deletions require a reviewed cloud correction
  mechanism; remote append-only entries cannot simply disappear.
- **Self-reported input:** the athlete/third-party source can misreport minutes,
  regions and occurrence time; the server enforces consistency and ownership,
  but cannot verify physical exercise. Server receipt times are authoritative
  for recovery observations only.
- **Clock/timezone:** date is submitted in device-local format with a
  constrained tolerance around UTC. Travel and daylight-saving changes
  require further native QA before clinical-safety claims.
- **No medical safety certification:** 48-hour overlap, regions, prescription
  minutes and recovery gates are product heuristics, not clinical diagnosis.

## Automated verification

The PR's PostgreSQL 16 CI job applies the original lease migration followed by
`20261110190000_authoritative_training_ledger.sql`, then tests privacy,
immutable/idempotent events, cross-account isolation, duplicate session
denial, post-load recovery requirements, budget exhaustion, remote renewal
interruption and reserved starts. A separate two-connection race verifies
only one start wins and creates exactly one server reservation.
The mobile Vitest suite checks upload ordering, a missing plan, offline
sync denial, data validation, 89-day backfill, pagination, bounded atomic
batch acknowledgements, and stable retry IDs for regional recovery. PostgreSQL
also checks batch rollback and immutable recovery event replay.

**CI is not a substitute for Supabase staging or native multi-device tests.**

## Staging rollout (NOT executed)

1. Set up a dedicated Supabase staging environment and apply the two SQL
   migrations in order. Never put a Supabase service role key in Expo.
2. Sign into two devices with the **same** cloud account; verify exactly one
   start, same-day blocked repeat after a crash, completion upload, read-back
   on the other device, and independent athlete privacy.
3. Test local new pain on phone A while B runs: B must stop on the next
   renewal; failed recovery uploads must not appear as remote clearance.
4. Test internet loss during uploads and restore/retry, expired leases, DST,
   timezone changes, partial workouts, shared rooms and unlogged training.
5. Backfill/reconcile pre-activation records with a separate reviewed
   migration policy. Do **not** auto-publish old "stable" recovery reports
   as new server observations.
6. Only after those tests enable the public flag for a controlled staging
   build. Keep production disabled, PR in draft and unmerged until reviewed.
