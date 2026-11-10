# Daily Training Ceilings — Integration Milestone

## Purpose

Side Quest must reward adherence to an appropriate prescription rather than extra, unscheduled loading. The daily ceiling is an **upper bound, not a goal to use up**. A "too easy" response does not unlock more training.

## Architecture

1. A planned session comes from the saved training block, not a caller-provided scheduled flag.
2. `assessWorkoutStart` builds or loads a dated ceiling and evaluates the workout against current readiness, planned session identity, affected regions, and recorded load.
3. The shared `WorkoutProvider.beginWorkout` gateway refuses to create a live workout session until the assessment authorizes it. Quick-workout and favorites entry points route through guarded preview.
4. Only discretionary additions can use a documented written exception. Worsening symptoms, missing or stale recovery evidence, mismatched loading regions, and exceeded prescribed ceilings require reassessment or re-planning; `stop` decisions cannot be overridden. Evaluations and permitted exceptions are recorded separately.
5. The athlete can report **overall, Achilles, and upper-back** recovery separately. A global normal check-in does not imply those tissue-specific recoveries are stable.
6. A current `unable_to_train` check-in is a non-overridable pause, including if no daily budget exists.
7. Completed solo and shared workouts are logged as completed exposures only **after** the existing training-history write succeeds. Saving failures do not silently mark a session completed.
8. Before any new start, previously saved workouts are reconciled against the guardrail ledger; missing events are reconstructed with idempotent IDs.
9. Imported endurance activity and completed strength workouts in a rolling 48-hour window are inspected for possible Achilles or upper-back loading overlap. A check-in performed before an overlapping exposure does not qualify as post-exposure recovery evidence and cannot unlock a documented exception. Overlap triggers a conservative reassessment; no direct minute-for-minute equivalence between sports is assumed.
10. After completion, recovery must be explicitly rechecked before its result can justify another exposure; the last check-in cannot predate the workout. A paused live workout cannot resume training across a calendar-day change or beyond an eight-hour authorization window; previously recorded work may be saved as partial. Calendar edits can narrow but not silently expand a budget.
11. Edited and deleted workout records are reconciled through append-only retractions and revised completion events, preserving an auditable history.
12. Post-workout urges can be recorded separately from completed activity, and the daily UI summarizes them without treating motivation as load.
13. SQLite tables `daily_training_ceilings` and `training_guardrail_events` are scoped to the athlete and included in local data export/deletion. Live workout checkpoints now have athlete-scoped storage keys and reject malformed snapshots; legacy unscoped sessions are deliberately not auto-restored to avoid cross-account leakage. A new explicit no-training restriction or significant pain report can interrupt a workout already in progress. Event IDs are idempotent.

## Decision policy

| Input state | Decision |
| --- | --- |
| Invalid activity or red flag; training paused | stop |
| Worsened / missing affected-region recovery, or a stale pre-workout check-in | defer; fresh assessment required |
| Unplanned activity under strict ceiling | defer |
| Session ID absent or different from saved plan | defer |
| Completed dose already exhausts budget | defer; no text-only exception |
| Proposed dose exceeds remaining budget | modify; reduce or re-plan before starting |
| Planned, unconsumed, within budget, stable regions | allow |

This is decision support, not automated medical clearance. Regions are conservatively inferred from workout targets **and individual exercises' muscle, joint and movement-pattern metadata**. This is not a validated injury-load or tissue stress model.

## Validation

Run `pnpm install --frozen-lockfile`, `pnpm --dir packages/planner typecheck`, `pnpm --dir apps/mobile typecheck`, and `pnpm --dir packages/planner test`. GitHub Actions runs these on pull requests, together with an integration-contract audit that checks for unguarded workout-entry paths. Planned-but-unperformed work must not appear in completed-exposure history.

## Release blockers / remaining risks

- **External endurance activities:** imported run/bike/swim/HIIT sessions and saved strength sessions now trigger rolling 48-hour tissue-overlap cautions, but are not converted to equivalent strength minutes or modeled with validated cumulative injury load. Walking without an imported session and missing data remain invisible. Cross-sport cumulative tissue exposure needs a dedicated model.
- **Cross-device synchronization** of guardrail ceilings/events is not implemented; the SQLite ledger is local. Authenticated active-session leases now have an off-by-default server-coordinated staging implementation, but synchronized load/recovery evidence and sequential activity prevention are still missing.
- **Atomicity and reconciliation:** workout history and guardrail event writes currently occur separately. The start gate now reconciles saved workouts into missing events, but interruption during the active session, deleted-workout corrections, and legacy entries are now covered by planner unit tests; on-device database and offline recovery scenarios still require integration testing.
- **Recovery evidence:** the timestamped regional check-in is self-reported and not clinician clearance. A stable symptom response does not guarantee a safe increase.
- **Override workflow:** discretionary exceptions require a recorded reason, while mandatory recovery and prescribed loading constraints block workout starts. Exercise additions outside the app, imported activities, and every possible collaboration entry point need further audit. Consent prompts do not physically prevent athletes exercising.
- **Human device QA:** verify preview, recovery modal, interruption/relaunch, early exit, repeated starts, logged exceptions, shared-room behavior and offline database failures on supported platforms.
- **Reliability:** local persisted sessions are now athlete-scoped and expire after eight hours or a date change, but device QA must validate migrations, local-day rollover, interrupted writes and cross-session / cross-device races. The eight-hour expiry is a conservative product policy, not a clinical exercise threshold.

Bonus workouts after a recorded exposure must go through a revised prescription, including when the original daily plan is missing. Recorded activity is never inferred from an athlete's motivation or an unsaved recommendation.

Keep this PR in draft until the above release blockers are addressed or consciously scoped.

## CI and data-integrity verification

The feature runs planner safety/regression tests, all-workspace TypeScript
checks, real mobile authorization-service integration tests, athlete-scoped
checkpoint restoration tests, and **real SQLite SQL/rollback tests**. Current
feature contracts, all workspace tests, exercise/media validations, and
runtime navigation checks also run as a separate job. See the integration
test details in [the release QA matrix](TRAINING_GUARDRAILS_RELEASE_QA.md).

Previously ambiguous exercise catalog identities were resolved by retaining
the canonical barbell Romanian deadlift, barbell bench press, and cable chop
definitions and removing redundant gym-expansion copies. Duplicate metadata
could otherwise make the tissue-loading inference non-deterministic.

## Cloud-profile active-session exclusivity (staged, OFF by default)

A separate Supabase migration and an opt-in `EXPO_PUBLIC_DISTRIBUTED_WORKOUT_LOCKS`
flag now provide server-coordinated, 90-second active-workout leases for
authenticated cloud accounts. Solo and shared workout screens renew leases
every 30 seconds and on foreground, and pause when verification fails.
Local profiles have no shared cloud identity. The SQL migration has been
verified in PostgreSQL CI, but **has not been deployed to the live project**;
the opt-in flag must remain off until staging and real-device checks pass.

**New staged synchronized dose enforcement:** the second migration
`20261110190000_authoritative_training_ledger.sql` adds server-side
completed exposure/recovery histories and immutable reservations. Every
new cloud start publishes recent recorded work and the daily prescription
before a transaction checks shared actuals, potential reserved work, and
post-exposure recovery. Server status is visible separately from local
training history in the daily-ceiling screen.

This remains OFF by default and **has not been deployed**. A phone that is
offline or running an older/nonparticipating client cannot reliably submit
new information, and unlogged exercise remains invisible. A verified server
claim is a product-level authorization, never medical clearance. See the
[staged ledger rollout guide](AUTHORITATIVE_TRAINING_LEDGER.md).

See [cloud lease rollout and guarantees](CLOUD_WORKOUT_LEASE_ROLLOUT.md).

## Manual QA

See [the expanded release QA matrix](TRAINING_GUARDRAILS_RELEASE_QA.md). No unexecuted device case is marked as passed.
