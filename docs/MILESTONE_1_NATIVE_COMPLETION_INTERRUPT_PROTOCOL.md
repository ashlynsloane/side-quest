# Milestone 1 — native interrupted-strength completion acceptance (#13)

**Disposition: window A is implemented and pending actual simulator proof; window B remains not implemented.** The existing Node SQLite `SIGKILL` test
proves the transaction's disk rollback and the 43% journal retry in the
Node/Expo adapter. A synthetic native simulator build, XCTest/Maestro journey,
and *real app process termination during pending canonical completion* are
still needed. None of the tests below authorize touching a real beta install.

## Synthetic native implementation now on draft PR #12 (unverified)

The first of the two interruption gates is now implemented and integrated
into the independent `completion-kill` Maestro scope:

- `apps/mobile/src/services/native-qa-completion-kill.ts` enforces **both**
  the exact synthetic simulator bundle identifier and a dedicated local
  `.invalid` account before a post-journal pause can occur. The real beta
  bundle cannot activate this seam.
- `apps/mobile/src/app/active-workout.tsx` exposes an accessibility marker
  only **after** `saveLiveWorkoutSession` successfully persisted the original
  `{completedAt, completionFraction}` pending journal and strictly **before**
  `withVerifiedAthleteDatabase` begins the canonical SQLite write. A
  restored pending journal bypasses the hold to permit a genuine retry.
- `e2e/maestro/synthetic-completion-kill-before.yaml` reaches this pause
  after one completed station and early partial save.
- `scripts/qa/kill-synthetic-pending-completion.sh before` verifies an
  exact embedded owner, no existing canonical workout/ledger rows, and
  `PRAGMA quick_check = ok`. It obtains the exact UIKitApplication PID from
  the isolated simulator's `launchctl list`, then sends **real `kill -9`**.
  It fails closed if there is not precisely one numeric PID for the exact
  synthetic bundle. No graceful `simctl terminate` substitutes.
- `e2e/maestro/synthetic-completion-kill-after.yaml` cold launches without
  clearing app data; accepts direct restored workout or Today→Resume,
  requires retry of the interrupted partial, and records screenshots.
- `kill-synthetic-pending-completion.sh after` requires exactly one
  `completed_workouts` and one matching `workout_ledger` row, an unchanged
  partial fraction strictly between zero and one, matching timestamps,
  zero fabricated completed sets, the proper database owner, and clean SQLite
  integrity. The JUnit + SQL postconditions must *both* pass.
- `packages/planner/test/native-completion-kill-gate.test.ts` guards
  beta-bundle exclusion and correct journal→hold→SQL ordering; JUnit
  diagnostic tests fail on missing, skipped or invalid native evidence.

**No native completion-kill PASS may be claimed until the source-matched
Release simulator and its SQL evidence have completed.** Window B (true kill
*inside* the uncommitted SQLite transaction) is still separate, as are
historical human-owner provenance, physical-device testing and rollback
authorization.

## Accepted design

Use a separate, clean `com.sidequest.synthetic.qa` simulator with exactly
one fixture identity, e.g. `synthetic-save-interruption@example.invalid`.
Do not enable a fault-injection seam in any other bundle or identity, and
never use a real athlete, real cloud credentials, or an installed beta data
container.

Two independent real-process interruption windows are required.

### A. Pending journal written, canonical SQLite not started

1. Create the QA local profile, complete first-week onboarding, generate and
   begin a strength workout. Complete one station; end early and select
   **Save partial** (actual fraction strictly greater than zero and strictly
   below one).
2. Before touching canonical SQLite, await
   `saveLiveWorkoutSession` including its immutable
   `{ completedAt, completionFraction }`. In the synthetic bundle only,
   expose a dedicated readiness testID *after the await*, and hold the
   completion continuation.
3. On the macOS test runner, confirm zero canonical
   `completed_workouts` and `workout_ledger` rows for that fixture,
   then terminate the **actual simulator app process**. Record process-exit
   evidence. A graceful `Leave`, soft route change, or ordinary restart
   is NOT this test.
4. Relaunch the app without clearing state. Assert the same unfinished
   completion restores in a retry-required state and does not silently
   resume an unrelated workout or mark it 100% completed.
5. Retry once and verify the original completion fraction, timestamp,
   idempotency key, linked planned session, exercise logs (if any), and
   exactly one canonical ledger record. No phantom completed sets.

### B. Transaction begun, canonical commit interrupted

1. Start with a **new clean synthetic profile**, completed first-week plan,
   and a new genuinely partial strength session. Open the canonical SQLite
   transaction and perform one *uncommitted* write.
2. At a safe synthetic-only failpoint, hold the transaction while preserving
   the original pending completion journal. Confirm through instrumentation
   that the write is uncommitted. Force-terminate the app process.
3. Reopen after crash. Verify SQLite WAL recovery rolled back every
   incomplete canonical row and the pending journal still contains the
   original fraction and timestamp. Retry the same stable completion ID.
4. Verify exactly one ledger record, one matching
   `completed_workouts` record, correct planned-session status, and
   derived exposure/activity counts. A second retry must be idempotent,
   never convert an interrupted 29–43% dose to 100%, and never count
   wall-clock paused time as exercise.

Both gates must include native JUnit, a screenshot/hierarchy of the pending
completion before termination, screenshots after relaunch, and read-only
embedded-owner/SQLite `PRAGMA quick_check` postconditions. Missing,
skipped, timed-out, or contradictory evidence is **FAIL/NOT VERIFIED**.
Synthetic debug failpoints must not be a runtime option on beta builds.

## Existing verified prerequisites

- `apps/mobile/src/app/active-workout.tsx` journals the original fraction
  and timestamp *before* `saveCompletedWorkout`; retries use the original
  `<workoutId>_<startedAt>` stable idempotency key.
- `packages/planner/test/actual-mobile-workout-sqlite.test.ts` exercises
  injected SQL failures, cold module/database reload, stale retry, and real
  OS process kill of a separate SQLite writer.
- Native [six-stage success #43141133431](https://github.com/ashlynsloane/side-quest/actions/runs/43141133431)
  includes Leave → cold relaunch → resumed workout → partial save, but
  **does not kill the process while completing**.
- [Issue #13](https://github.com/ashlynsloane/side-quest/issues/13)
  stays open until both actual iOS interruption windows are independently
  evidenced and physical-device acceptance is authorized.

**Safety constraints:** no merge or installed-beta update; no real profile
keys, screenshot identifiers, training rows, or DB file contents in logs.
