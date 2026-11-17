# Milestone 1 — Athlete-confirmed routine start, recovery, and withdrawal

**Status:** Prototype on isolated **draft/unmerged PR #12**. Neither a signed physical-iPhone acceptance result, an installed-beta change, a medical clearance system nor an approved release.

## Delivered local-first safety boundaries

1. **Exact athlete authorization.** An immutable review of a single routine-strength prescription is confirmed by the athlete. The original plan remains unchanged. Authorizing does not automatically execute the workout. Rehabilitation and restriction-aware care do NOT qualify for this athlete-only gate.
2. **Immutable one-way authorization withdrawal.** Explicit athlete confirmation appends an owner-verified event. A withdrawn consent or a damaged audit holds a new start. Prior completion records are never deleted.
3. **Read-only pre-start screen.** A consistent SQLite snapshot validates the exact approved exercise prescription, current local day, readiness, symptoms, safety context, restrictions, plan source, completed history and previous start journals. Its 'eligible' result is diagnostic ONLY.
4. **Atomic native start recovery seed.** An exclusive SQLite transaction reruns the same safety evaluator, checks the UI's local observation token for drift and writes BOTH the one-time start intent and a paused initial workout checkpoint derived from the immutable authorized prescription. Any failure rolls back both rows. Audit integrity checks reject forged workout versions, dates, ownership, duplicated starts and orphaned events. The SQLite seed records NO timer playback.
5. **Reviewed-workout player entry.** On the review detail screen, the athlete explicitly confirms Start. The app refreshes pre-start evidence, commits the verified SQLite seed, then writes and verifies the paused, exact-authorized player checkpoint in the per-athlete local recovery store. React's active player is populated and navigation occurs ONLY after persistence succeeds. If the checkpoint cannot be written, the screen retains its error instead of showing an unsaved started workout. The athlete must consciously resume the paused player; no automatic exercise timer starts.
6. **Existing generic workout start/exit hardening.** The ordinary workout-preview Start now awaits its durable live checkpoint write before updating React state or navigating, with in-flight guards against double taps. Finishing and discarding await confirmed checkpoint cleanup before clearing UI state or leaving; failed cleanup keeps the session available for retry. An approved routine start NEVER replaces any pre-existing player checkpoint.

## Native tables and protected backups

- \`strength_workout_authorizations\`: exact athlete-confirmed version
- \`strength_workout_authorization_withdrawals\`: append-only revocations
- \`strength_workout_start_intents\`: immutable requested-start history, not playback proof
- \`strength_workout_native_start_checkpoints\`: matching initial paused player snapshot, persisted with the intent in one transaction

All new tables are included in mobile SQLite initialization, full local export and mandatory critical audit export. No destructive legacy migration, cloud release or production data edit was made. The initial SQLite checkpoint is intentionally not treated as the latest authoritative *progress* snapshot after the athlete starts logging exercise.

## Exact automated checks and their limitations

The real, file-backed Node SQLite acceptance exercises the actual mobile SQL service through an Expo transport shim. Planner regressions cover: one exact checkpoint plus intent, no premature workout ledger insert, double-tap rejection, withdrawal, missing owner, changed readiness/restrictions/source/completion, altered checkpoint, orphan audit, failed second SQL write and rollback, backup/export and process/file reopen. Mobile checks cover SQL write injection, cold restart, paused state, no overwrite, storage failure and failed cleanup preserving the original session.

TypeScript, full planner/mobile SQLite tests, synthetic athlete acceptance and iOS JavaScript bundle export are necessary CI checks; none proves an installed native app or signed physical-device workflow. Report passing counts ONLY from a successful exact-head CI run.

## Unfinished release-critical recovery/safety work

1. **Cross-store interruption reconciliation.** If SQLite commits the initial seed but localStorage write is interrupted, a safe explicit resume/reconciliation path must be implemented and evaluated against later withdrawal, new restrictions, a changed local day, completed sessions and intentional discard. NEVER replay an old initial checkpoint automatically or erase a progressed recovery snapshot. Include unambiguous abandonment/terminal-state markers.
2. **Safety changes during active playback.** A withdrawal or new restriction after the initial launch must produce a clearly defined stop/hold and protect actual logged dose. Already-started workouts are not cancelled automatically by the current withdrawal transaction.
3. **Full native iOS acceptance.** Run the exact source in an isolated signed build, exercise P01–P15 including rapid taps, process termination between the SQLite and per-athlete checkpoint writes, background saves, refusal and recovery, profile changes, partial completion, restart and storage failures. Treat simulator/JS-export success separately.
4. **Legacy ownership and recovery.** Verify existing real profile database adoption and rollback, critical audit export, canonical training ledger and recovery behavior before release.
5. **External medical evidence and approval.** Integrate authoritative provider limitations and avoid treating athlete-set labels as clinician verification. Explicit release-owner signoff remains necessary.

**Release = HOLD.** Do not merge/deploy this draft, modify cloud PR #20 or touch an installed beta until these gates are resolved.
