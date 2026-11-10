# Cloud Workout Lease — Staged Rollout and Safety Contract

**Status:** implemented behind an OFF-by-default flag. The migration is committed,
but **has not been deployed to a real Supabase project** in this work.
Do not enable distributed workout leases for beta users until live staging,
native app and multiple-device tests pass.

## Problem solved — and not solved

With cloud workout leases enabled for authenticated accounts, two devices
using the same Supabase identity cannot simultaneously hold the **same
athlete's active workout lease** while the lease is valid.

- PostgreSQL 16 enforces one row per authenticated user with an atomic
  `INSERT ... ON CONFLICT ... WHERE expires_at <= clock_timestamp()`.
- Every lease has a server-created UUID token and a 90-second expiration.
  Tokens cannot be read or written through the table by ordinary clients.
- The athlete-specific RPCs use `auth.uid()`, are security-definer functions
  with an empty search path, and are executable by `authenticated` only.
- Every cloud workout start must acquire the lease **after** local
  authorization but **before** writing its first checkpoint or activating
  playback.
- A failed write, profile switch during an asynchronous start or rejected
  server claim does not activate the workout. Release is attempted and
  server-side expiration is the ultimate fallback.
- Solo and shared workout playback renews every 30 seconds and on foreground.
  Loss of the server lease or lack of network verification **pauses** the
  workout; saving previously completed work is still possible.
- A resumable solo checkpoint or shared-room participation record stores
  only the current athlete/room's lease and never overwrites a newer token.
  A previous-day or aged solo authorization is independently invalidated.
- Local-only profiles still operate locally: they do **not** have a shared
  server identity and are **not** protected against another phone.

**New synchronized ledger (still disabled and undeployed):** the second
migration adds immutable completed exposures, explicit server-timestamped
regional recovery, an immutable daily prescription and conservative
server-reserved session doses. Cloud starts and renewals use v2 RPCs to
evaluate the shared history atomically. **This does not capture offline,
unlogged, unsynchronized legacy builds or medically validate any tissue-load
calculation.** See [authoritative ledger specification](AUTHORITATIVE_TRAINING_LEDGER.md).

## Prerequisites to enable (not executed here)

1. Configure a dedicated **staging** Supabase project with authentication
   and the app's public publishable key, never a service-role key in Expo.
2. Apply all three migrations in ascending order:
   `20261110150000_training_workout_leases.sql`,
   `20261110190000_authoritative_training_ledger.sql`,
   `20261110210000_reviewed_training_corrections.sql`.
   The staging dry-run helper refuses ambiguous/production-equal project IDs.
   Inspect ALL pending CLI migrations and staging schema before applying.
3. Run the CI PostgreSQL migration/security tests and run a staging test with
   two **real authenticated** devices using the same account.
4. Verify lock contention, app foreground/background, loss of connectivity,
   crash/restart, completion, manual exit and signed-out account changes.
5. Only then set `EXPO_PUBLIC_DISTRIBUTED_WORKOUT_LOCKS=true` for the tested
   cloud build and rebuild/redeploy it. Both devices must use protected builds;
   an older build with the flag off remains an uncontrolled entry point.
6. Roll out conservatively; keep the flag off if errors or device regressions
   occur. Turning it off is a **product safety trade-off**, not a solution to
   previous duplicate loads.

This flag must never be switched on before its SQL migration is deployed.
No live database changes are performed by submitting this PR.

## Automated verification in the PR

The existing guardrail workflow runs:
- TypeScript and full planner/mobile integration tests.
- Real PostgreSQL 16 with temporary mock `auth.uid()` and `auth.users`
  for the migration and permissions.
- Authenticated acquisition, second-device denial, token-only renew/release,
  independent athlete scopes, expired lease reclamation, and **five independent
  two-connection races** to confirm one winner per athlete.
- Client lease monitor tests for foreground renewal, network loss, expired
  tokens, late responses, incorrect tokens, and local checkpoint failures.
- Shared-room local lease persistence/isolation tests.

`.github/workflows/android-native-smoke.yml` is a **manual experimental**
Android emulator build-and-launch workflow, not an executed device test or
release gate. Even if it passes, it will not verify cross-device cloud behavior.

## Updated synchronized-ledger rollout

The synchronized architecture uses the **second staged migration**,
`20261110190000_authoritative_training_ledger.sql`, and the **third reviewed
correction / recovery supersession migration**,
`20261110210000_reviewed_training_corrections.sql`.
Cloud workouts now synchronize recorded actuals before the v2 start RPC;
the server checks immutable daily planned dose, completed exposures,
session reservations and latest regional recovery in one transaction.
A successful lease is renewed only while remote restrictions still permit it.
PostgreSQL CI tests the migration and genuine concurrent acquisition;
this has not been deployed to live Supabase.

**Still not solved:** complete offline/legacy activity ingestion, reviewed
amendments to the initial plan, user-facing local correction/retraction workflow,
atomic account-switch behavior on physical devices, and prospective clinical
validation. Device-local and external-source exercise history remains
self-reported. See the [ledger rollout guide](AUTHORITATIVE_TRAINING_LEDGER.md).

**Current staging gate:** the third migration also restricts cloud lease
requests to the full prescribed region set, prevents reservation corrections
when a completion exists, and tombstones unresolved older recovery events
when an explicitly worse/red-flag observation supersedes them. Mobile
saves restrictive symptoms locally on cloud failure, but cannot transmit
them to an offline second device.

The selected 90-second TTL, 30-second renewal and recovery thresholds remain
product policies, not clinical physiological safety thresholds.
