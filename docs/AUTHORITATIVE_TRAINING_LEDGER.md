# Synchronized Training Ledger — Staged Architecture and Release Gate

**Status: implemented in draft code; PostgreSQL CI is the required verification gate. Not deployed.**
The cloud gate remains OFF unless `EXPO_PUBLIC_DISTRIBUTED_WORKOUT_LOCKS=true`,
and **all three** migrations are applied in order. This is self-reported training data, not
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
  not an automatic client overwrite. The reviewed amendment protocol below
  does not authorize daily plan expansion.
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

## Reviewed correction/retraction protocol (third migration; feature OFF)

Migration `20261110210000_reviewed_training_corrections.sql` follows
`20261110150000_training_workout_leases.sql` and
`20261110190000_authoritative_training_ledger.sql`. Applying only two
migrations is no longer sufficient for this branch's contract.

A correction is NOT a local UPDATE or DELETE on the cloud ledger:

1. The authenticated athlete submits `request_training_remote_correction`
   with a durable request ID, an existing original event/session ID and date,
   one predefined reason code, and either `retract` or `replace_minutes`.
   `replace_minutes` is supported for completed exposure events only.
   Reservations can only be requested for retraction when they were genuinely
   unused. The athlete must reuse the same request ID on uncertain retry.
2. The new request does not change the authorization budget, region history,
   snapshot or workout lease. Rejected requests have no effect. A pending
   correction is NOT confirmation that the physical activity did not happen.
3. An authorized human reviewer examines the original and proposed record,
   external activity provenance where available, and whether any work actually
   occurred. **Only a trusted server with the Supabase service-role credential**
   may call `review_training_remote_correction`. The service credential must
   never be distributed with the mobile client, exposed in Expo config or
   stored in a public CI log.
4. A reviewer approves or rejects with an 8–128 character case/reference ID.
   Approval is blocked while an unexpired workout lease exists for the athlete.
   A decision is immutable and idempotent; a target can have at most one
   approved amendment in this first version. Further revisions require a
   separately reviewed successor design.
5. The original exposure/reservation row is retained for audit. Private
   effective-ledger views apply **approved** minute amendments and retractions
   to the dose and 48-hour regional checks. The snapshot reflects the effective
   records; `read_training_remote_corrections` separately reports the
   athlete's own request/decision audit.
6. An approved corrected exposure may be synchronized using either the
   originally recorded minutes or the approved replacement minutes under
   the same immutable event ID; any third, unreviewed value is rejected.
   An approved unused reservation can free budget for a **different** prescribed
   session, but its session identity remains consumed permanently, preventing
   the previously started session from being restarted.

**Current mobile scope:** the typed `requestRemoteTrainingCorrection` and
`readRemoteTrainingCorrections` APIs are implemented and unit-tested. There is
not yet a user-facing correction form, reviewer web console, durable correction
outbox, or deletion/edit detection that automatically opens a request. Athletes
cannot approve corrections. Until those interfaces and workflow checks exist,
changed local entries without an approved amendment may block synchronization,
which is the intentional fail-closed behavior.

**No automatic recovery rewriting.** Incorrect recovery observations are not
retroactively erased by this migration; a fresh explicit regional check can
supersede an old observation at a new server timestamp. Plans likewise remain
immutable and cannot silently expand.

## Dedicated Supabase staging gate (not executed)

The current PR cannot claim staging deployment because it does not contain
a dedicated staging project ID, service-role authentication, or two enrolled
physical clients. Required controlled sequence:

1. Create/select a *nonproduction* Supabase project and validate that its
   project ref cannot resolve to production. Back up the staging database.
2. Apply all **three** migrations in timestamp order using the Supabase CLI
   or reviewed SQL migration process. Do not apply the mock-auth CI setup.
   Verify privileged RPC grants, RLS, and that old v1 lease acquisition
   is revoked for authenticated athletes.
3. Use an isolated test athlete and two independently authenticated mobile
   devices. Reproduce concurrent start, one permitted lease, crash-reservation,
   imported bike/swim/run backfill, recovery after exposure, and network-loss
   retries.
4. Request a duration correction on phone A. Before approval, verify phone B
   still counts the original minutes. Review on a **trusted server**, verify
   exactly one approved amendment, and confirm both phones see the revised
   effective snapshot. Attempt an unapproved third value and expect denial.
5. Repeat for an unused reservation and a rejected or cross-athlete request.
   Verify the original session remains non-reusable, and that an active lease
   prevents approval. Then test a permitted *different* scheduled session.
6. Test old clients, revoked permissions, account erasure, stale devices,
   timezone/DST changes, disconnects, re-login and clinical red flags. Only
   after explicit review should a staging build enable the feature flag.

The first two migration tests and the new correction test are run against
disposable PostgreSQL 16 in CI, **not** against Supabase Auth or real devices.
This separation is required for a reliable release decision.
