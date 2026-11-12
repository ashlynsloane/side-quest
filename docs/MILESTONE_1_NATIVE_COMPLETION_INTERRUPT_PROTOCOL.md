# Milestone 1 — native interrupted-strength completion acceptance (#13)

**Disposition: REQUIRED / NOT RUN.** The existing Node SQLite `SIGKILL` test
proves the transaction's disk rollback and the 43% journal retry in the
Node/Expo adapter. A synthetic native simulator build, XCTest/Maestro journey,
and *real app process termination during pending canonical completion* are
still needed. None of the tests below authorize touching a real beta install.

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
