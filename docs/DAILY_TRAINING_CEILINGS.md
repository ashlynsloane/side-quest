# Daily Training Ceilings — Integration Milestone

## Purpose

Side Quest must reward adherence to an appropriate prescription rather than extra, unscheduled loading. The daily ceiling is an **upper bound, not a goal to use up**. A "too easy" response does not unlock more training.

## Architecture

1. A planned session comes from the saved training block, not a caller-provided scheduled flag.
2. `assessWorkoutStart` builds or loads a dated ceiling and evaluates the workout against current readiness, planned session identity, affected regions, and recorded load.
3. The shared `WorkoutProvider.beginWorkout` gateway refuses to create a live workout session until the assessment authorizes it. Quick-workout and favorites entry points route through guarded preview.
4. Non-emergency `defer` and `modify` decisions can be overridden by an explicit athlete-written reason; `stop` decisions cannot. Evaluations and overrides are written separately.
5. The athlete can report **overall, Achilles, and upper-back** recovery separately. A global normal check-in does not imply those tissue-specific recoveries are stable.
6. A current `unable_to_train` check-in is a non-overridable pause, including if no daily budget exists.
7. Completed solo and shared workouts are logged as completed exposures only **after** the existing training-history write succeeds. Saving failures do not silently mark a session completed.
8. SQLite tables `daily_training_ceilings` and `training_guardrail_events` are scoped to the athlete and included in local data export/deletion. Event IDs are idempotent.

## Decision policy

| Input state | Decision |
| --- | --- |
| Invalid activity or red flag; training paused | stop |
| Worsened / missing affected-region recovery | defer |
| Unplanned activity under strict ceiling | defer |
| Session ID absent or different from saved plan | defer |
| Completed dose already exhausts budget | defer |
| Proposed dose exceeds remaining budget | modify |
| Planned, unconsumed, within budget, stable regions | allow |

This is decision support, not automated medical clearance. Regions are conservatively inferred from current workout target-region metadata; a comprehensive exercise-level tissue-load model remains future work.

## Validation

Run `pnpm install --frozen-lockfile`, `pnpm --dir packages/planner typecheck`, `pnpm --dir apps/mobile typecheck`, and `pnpm --dir packages/planner test`. GitHub Actions runs these on pull requests and feature-branch pushes. Planned-but-unperformed work must not appear in completed-exposure history.

## Release blockers / remaining risks

- **External endurance activities** (Garmin/TrainingPeaks/imported rides, runs, walks) are not yet deducted from these daily strength budgets. Cross-sport cumulative tissue exposure needs an integrated policy.
- **Cross-device synchronization** of guardrail ceilings/events is not implemented; the SQLite ledger is local. Do not advertise synchronized limits.
- **Atomicity and reconciliation:** workout history and guardrail event writes currently occur separately; a crash between them could temporarily undercount training. Add a reconciliation process using the authoritative completed-workout ledger.
- **Recovery evidence:** the current independent regional check-in is self-reported and not clinician clearance. A stable symptom response does not guarantee a safe increase.
- **Override workflow:** exercise additions outside the app, imported activities, and every possible collaboration entry point need further audit. Consent prompts do not physically prevent athletes exercising.
- **Human device QA:** verify preview, recovery modal, interruption/relaunch, early exit, repeated starts, logged exceptions, shared-room behavior and offline database failures on supported platforms.
- **Reliability:** load event histories bounded by date; add integration tests for database migrations and cross-session / cross-device races.

Keep this PR in draft until the above release blockers are addressed or consciously scoped.
