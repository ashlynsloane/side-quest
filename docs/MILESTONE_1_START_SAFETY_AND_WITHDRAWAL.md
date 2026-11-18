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

## Recovery and active-session enforcement (new development work)

1. **Two-store interruption recovery is explicit.** SQLite start intent and paused initial seed commit together, while Expo localStorage remains a separate persistence engine. If localStorage fails after SQLite succeeds, the app retains both immutable audit rows; it will not claim playback started or retry Start. On the review detail screen the athlete may explicitly recover the *original* paused seed only after a fresh owner-scoped safety recheck and confirmation that the live slot is completely empty. Existing, progressed, unverified or unreadable checkpoints are never replaced.
2. **Permanent terminal ledger.** \`strength_workout_native_start_terminal_events\` stores one immutable, owner-bound \`discarded\` or \`completed\` event per routine session. Discard requires the athlete's explicit decision. Completion requires an exact matching canonical \`completed_workouts\` record with original workout identity and start time. A terminal event is written before local checkpoint cleanup. Retries after cleanup failure reuse the original terminal record; contradictory dispositions, corrupt audit and foreign owners fail closed. Startup checks terminal history before hydrating the player. Only an exact matching stale checkpoint is eligible for terminal cleanup.
3. **Local stale-write tombstones.** Clearing an authenticated workout saves a local end marker BEFORE removing its live checkpoint. A delayed timer/autosave for that same workout ID + original start time is rejected, so an ended workout cannot be resurrected by a stale callback. A new session with a different start time remains distinct. Signed-out cleanup remains a no-op.
4. **Sticky active safety hold.** For routines with an authorized native checkpoint, the player rechecks the original prescription, withdrawal, current-day readiness/symptoms, safety policy/protected movements, plan source, existing completion and local recovery identity. The screen calls this check on entry, foreground resume, each explicit timer/station continuation, and a four-second interval while mounted. Failure or unavailable evidence pauses the timer, disables progression and writes a sticky local \`safetyHold\` marker. Later timer/autosave writes cannot clear that marker or turn \`running\` back on. Saving already completed partial work is still available; no new exercise is authorized.
5. **Conservative old-journal handling.** An old \`strength_workout_start_intents\` record without a corresponding native checkpoint is a manual-reconciliation hold, not proof no start occurred. A stale local player with changed exercises, missing identity, unreadable data or a terminal event cannot be implicitly recovered.
6. **Native-side audit protection.** The new terminal table is created in the athlete-owned SQLite file and included in standard export plus critical-audit export. Node real-file SQLite tests cover withdrawal, readiness, symptoms, new restrictions, changed plans, duplicate sessions, explicit abandonment, missing canonical completion, SQL rollback, forged terminal events, cold restart, localStorage crash window, sticky hold, unreadable live slots, and stale-timer resurrection.

These are **source-level and synthetic tests only**. A 4-second poll is not instantaneous clinical monitoring; app suspension and external care changes may delay observation. The app must never imply that athlete-entered provenance verifies outside medical orders.

## Remaining release blockers

1. **Physical signed iPhone acceptance** on this exact integrated source: P01–P15, phone kill between the SQLite commit and localStorage checkpoint write, safe explicit recovery, background/foreground while running, new restrictions mid-session, terminal cleanup interruption, wrong account, partial completion and profile switching. The CI iOS JS export is not a native-device run.
2. **Historical data and recovery migration** on owned, representative prior beta databases and localStorage state with backup/restore and rollback. Do not silently adopt unknown user files.
3. **Authoritative clinical/source evidence** for restriction-aware rehab and return-to-sport. The current athlete-only routine workflow does NOT clear these tracks; unrestricted generic workout paths require separate comprehensive policy qualification.
4. **Release owner approval** after evidence review. Keep the PR draft/unmerged, the installed beta untouched and cloud PR #20 unchanged.

**Release = HOLD.** Do not merge/deploy this draft, modify cloud PR #20 or touch an installed beta until these gates are resolved.
