# Side Quest — Milestone 1 authoritative native acceptance record

**Status as of November 11, 2026 (local U.S. time): DRAFT / NOT RELEASED.**

**Canonical candidate:** [PR #12](https://github.com/ashlynsloane/side-quest/pull/12),
`test/automated-athlete-acceptance-v1`, targeting `sq2-experience-rebuild`.
No merge, installation, actual-athlete data access, Supabase migration,
cloud-feature enablement, or beta distribution is authorized by passing CI.

## Verified evidence versus pending acceptance

| Gate | Verified evidence | Status |
| --- | --- | --- |
| Planner/mobile typecheck, actual mobile SQLite, full regression, iOS JS export | [CI #43162812460](https://github.com/ashlynsloane/side-quest/actions/runs/43162812460), `aacb6b6a` | **PASS — 723/723 tests, 118 files** |
| Integrated six-stage native Release athlete journey | [Native #43147554597](https://github.com/ashlynsloane/side-quest/actions/runs/43147554597), updated synthetic Release source. Six stage-specific Maestro JUnit results all pass | **PASS — all six integrated stages on updated native binary** |
| Separate A→B→A→B in-progress strength checkpoint isolation | [Native #43152426701](https://github.com/ashlynsloane/side-quest/actions/runs/43152426701), `live-isolation` independently successful with archived evidence | **PASS on updated native binary** |
| Synthetic owner-mismatch startup and retry on actual simulator | [Native #43152426701](https://github.com/ashlynsloane/side-quest/actions/runs/43152426701), `owner-recovery` JUnit + unchanged training-block count, owner mismatch, `PRAGMA quick_check` | **PASS — actual native UI plus SQLite postconditions** |
| Synthetic A→B switch while A's generated first week is waiting to persist | [Native #43152426701](https://github.com/ashlynsloane/side-quest/actions/runs/43152426701), `generation-isolation` JUnit + distinct A/B goals and actual owner-tagged SQLite postconditions | **PASS — actual native UI plus SQLite postconditions** |
| iOS process termination during pending workout completion + recovery | Node disk-backed SQLite OS `SIGKILL` rollback PASS; synthetic iOS `completion-kill` (post-journal/pre-SQL) and `completion-in-transaction-kill` (after uncommitted INSERT) both implemented with independent JUnit + SQLite checks | **SOURCE QA PASS; NEITHER TRUE NATIVE KILL HAS PASSED YET** |
| Historical legacy database provenance and migration with rollback | Read-only legacy owner audit, consistent synthetic SQLite/WAL backup, and owner-checked synthetic restore into a NEW destination with original source hashes intact | **AUDIT/BACKUP/RESTORE QA PASS; REAL HUMAN OWNER PROVENANCE AND DEVICE MIGRATION NOT RUN** |
| Signed physical iPhone acceptance / rollback | [P01–P15 physical-device protocol](MILESTONE_1_PHYSICAL_DEVICE_ACCEPTANCE.md) | **NOT RUN** |

The synthetic native app was compiled and exercised in [run #43147554597](https://github.com/ashlynsloane/side-quest/actions/runs/43147554597), with all six integrated stages PASSED. Independent [run #43152426701](https://github.com/ashlynsloane/side-quest/actions/runs/43152426701) executed five focused jobs on that matching binary: **owner-recovery, generation-isolation, live-isolation and completed-history isolation PASSED**; the focused strength job **FAILED during QA profile-entry** because iOS entered the email into the name field, leaving email blank and Enter Beta disabled. It did **not** reach workout execution. This is separate from the six-stage native strength PASS. The original attempted native focus-flag assertion proved unreliable on iOS 26: the hierarchy reported focused=false even with the keyboard open. The synthetic flows now read back and assert the **actual exact name and email values** before requiring enabled Enter Beta. A new focused native run remains necessary to verify the change. Native UI-only execution is permitted only when the full native
source fingerprint exactly matches the archived synthetic Release binary.


**Latest build and test limitations:** The later iOS Release build [#43156856872](https://github.com/ashlynsloane/side-quest/actions/runs/43156856872) compiled and archived successfully but its integrated test was blocked at the QA sign-in `focused` selector, **before onboarding/workouts**; it does not contradict the earlier all-six PASS in #43147554597. The corrected readback-based login and two distinct real-SIGKILL crash gates are awaiting acceptance on the newer source-matched Release [#43161667578](https://github.com/ashlynsloane/side-quest/actions/runs/43161667578), whose native result has not yet been verified.

## What the native evidence actually proves

The six integrated stages on #43147554597 executed, in sequence:

1. Create a synthetic local athlete account.
2. Generate the first seven-day multisport plan.
3. Save an actual 75-minute bike activity.
4. Cold restart and recover its historical record/detail.
5. Switch athlete A→B→A, with B seeing no A completed activity and A's original ride recovered.
6. Start strength, complete a station, durably pause/leave, cold restart,
   resume, save a **partial** completion, and open the saved training-history detail.

The independent seven-stage privacy coverage on #43138494416 tests a
*different* property: A and B own separate in-progress strength checkpoints,
both survive a cold restart, and neither account sees the other's live session.
The latest independent `live-isolation` job in #43152426701 succeeded on the updated native binary, with prerequisite profile/onboarding passes. Do not call this the
original six-stage gate.

### New native ownership-denial gate

`apps/mobile/src/services/auth-startup-recovery.ts` and the auth/root
integration provide a fail-closed recovery screen if the embedded SQLite owner
does not match the saved profile. The saved profile and SQLite bytes remain
preserved. The synthetic owner-recovery test:

- Creates and onboards synthetic A on a clean QA-bundle simulator.
- Terminates that QA app and modifies **only the synthetic embedded owner row**.
- Requires the new app startup to show a recovery explanation and retry,
  never a signed-in Week tab.
- Checks a retry still refuses the unverified file.
- Independently verifies the original `training_blocks` count, unchanged
  mismatched owner, and `PRAGMA quick_check = ok`.

If the UI passes but the SQLite postcondition fails, the entire native gate
fails. There is **no real athlete migration procedure in this test**.

### New deterministic native first-week generation isolation gate

`apps/mobile/src/services/native-qa-generation-race.ts` is enabled only when
**both** the installed bundle is `com.sidequest.synthetic.qa` and A is the
exact synthetic local QA fixture identity. It cannot run in the ordinary beta
bundle. Its interruption seam occurs *after* A's draft was calculated but
*before* the owner-locked goal/training-block write. It waits to resume until
B's exact synthetic local ID is persisted **after B's SQLite activation**, not
for an arbitrary timeout.

`generation-isolation` then completes onboarding B and cold-relaunches,
followed by an independent read-only audit of the two actual SQLite files.
The A file must have no persisted first-week goal or training block; the B
file must contain exactly one distinct Ironman 70.3 goal/block, with zero
contamination from A's General strength goal and block; both embedded owners and
`PRAGMA quick_check` must be correct. This independent gate **PASSED** in
#43152426701. Missing JUnit, skipped steps,
unsupported scope, missing owner, or failing database postconditions are all
FAIL/NOT VERIFIED, never PASS.

The previously green disk-backed SQLite race tests also prove A cannot write
to B's active database during a queued activation or interrupted
goal/block/calendar sequence. They do **not** substitute for the new native
journey.

## Data-truthfulness and migration safeguards

- A partial workout records an immutable completion fraction and timestamp
  before its canonical SQLite transaction. Retries reuse the canonical
  idempotency key; a failed save cannot silently become 100%.
- The actual strength completion takes the verified athlete SQLite activation
  lock across canonical persistence; B's activation cannot interleave with A's
  write.
- Historical workout shares distinguish measured from planned-equivalent
  duration and never claim completion of prescribed exercises without set logs.
- Legacy *partial* completed-workout import keeps the fraction and planned
  exercise catalog but does **not** manufacture completed sets.
- A populated unmarked legacy SQLite file remains unclaimed until independent
  provenance is established. Filename similarities or localStorage reset are
  not owner evidence.
- `scripts/qa/audit-legacy-owner.mjs` inspects embedded owners and integrity
  read-only and does not report training rows or personal identifiers.
- `scripts/qa/backup-synthetic-legacy-sqlite.mjs` (opt-in, synthetic names)
  uses SQLite's consistent backup API to include committed WAL data, checks
  snapshot integrity, and atomically refuses destination overwrite. This is a
  *QA protocol rehearsal*, not migration of an existing iPhone beta.
- `scripts/qa/restore-synthetic-legacy-sqlite.mjs` rehearses restoration to an
  unoccupied synthetic path only after independent synthetic in-file owner
  verification, integrity checks, and protected no-overwrite publishing. The
  [source-level restoration tests](https://github.com/ashlynsloane/side-quest/actions/runs/43162812460)
  preserve committed WAL entries and original database/WAL hashes. No real
  owner is inferred and no beta data is migrated.

## Remaining release blockers and owner action

| Blocker | Tracking |
| --- | --- |
| Execute BOTH actual iOS SIGKILL windows—after immutable journal/before SQL and after uncommitted INSERT/before COMMIT—then verify separate native JUnits, owner-tagged SQLite rollback, idempotent partial retry | [Issue #13](https://github.com/ashlynsloane/side-quest/issues/13) |
| `generation-isolation` native JUnit and A/B SQLite postcondition PASSED; keep release integration tracked until approval | [Issue #19](https://github.com/ashlynsloane/side-quest/issues/19) |
| `owner-recovery` native JUnit and original-row/owner/SQLite postcondition PASSED; real historical owner provenance still separate | [Issue #15](https://github.com/ashlynsloane/side-quest/issues/15) |
| Document original owner provenance for any ambiguous historical real database, consistent restorable backup, deliberate migration and rollback | [Issue #15](https://github.com/ashlynsloane/side-quest/issues/15) |
| Execute P01–P15 on a signed physical iPhone and approve release/rollback plan | [Physical-device protocol](MILESTONE_1_PHYSICAL_DEVICE_ACCEPTANCE.md) |
| Keep [cloud guardrails PR #20](https://github.com/ashlynsloane/side-quest/pull/20) separate, staged and feature OFF | Out of Milestone 1 |

**Current decision: HOLD.** Do not merge PR #12, install a QA binary over
existing beta data, migrate actual files, or describe unexecuted tests as
passing. This document is an evidence snapshot, not an automatic release
authorization.
