# Side Quest — Milestone 1 authoritative native acceptance record

**Status as of November 14, 2026 (America/Denver): DRAFT / NOT RELEASED.**

**Canonical candidate:** [PR #12](https://github.com/ashlynsloane/side-quest/pull/12),
`test/automated-athlete-acceptance-v1`, targeting `sq2-experience-rebuild`.
No merge, installation, actual-athlete data access, Supabase migration,
cloud-feature enablement, or beta distribution is authorized by passing CI.

## Verified evidence versus pending acceptance

| Gate | Verified evidence | Status |
| --- | --- | --- |
| Planner/mobile typecheck, actual mobile SQLite, full regression, iOS JS export | [CI #43667411684](https://github.com/ashlynsloane/side-quest/actions/runs/43667411684), `6750e369` | **PASS — 723/723 tests, 118 files** |
| Integrated six-stage native Release athlete journey | [Native #43161667578](https://github.com/ashlynsloane/side-quest/actions/runs/43161667578), newer source-matched synthetic Release binary. Six stage-specific Maestro JUnit results all PASS | **PASS — all six integrated stages on updated native binary** |
| Separate A→B→A→B in-progress strength checkpoint isolation | [Native #43667407720](https://github.com/ashlynsloane/side-quest/actions/runs/43667407720), new independent `live-isolation` success on the current QA binary | **PASS on updated native binary** |
| Synthetic owner-mismatch startup and retry on actual simulator | [Native #43667407720](https://github.com/ashlynsloane/side-quest/actions/runs/43667407720), current `owner-recovery` independently PASS, JUnit + unchanged block count, mismatched in-file owner and `PRAGMA quick_check` | **PASS — actual native UI plus SQLite postconditions** |
| Synthetic A→B switch while A's generated first week is waiting to persist | [Native #43667407720](https://github.com/ashlynsloane/side-quest/actions/runs/43667407720), new `generation-isolation` JUnit success; prior SQL/A-B owner assertions retained | **PASS — actual native UI plus SQLite postconditions** |
| iOS process termination during pending workout completion + recovery | [Native #43667407720](https://github.com/ashlynsloane/side-quest/actions/runs/43667407720), both separate exact-bundle iOS `SIGKILL` jobs plus independently archived JUnit, app-death process logs, rollback/post-retry SQLite row counts, embedded-owner and integrity checks | **BOTH REAL SIMULATOR CRASH WINDOWS PASS — physical iPhone NOT RUN** |
| Historical legacy database provenance and migration with rollback | Read-only legacy owner audit, consistent synthetic SQLite/WAL backup, and owner-checked synthetic restore into a NEW destination with original source hashes intact | **AUDIT/BACKUP/RESTORE QA PASS; REAL HUMAN OWNER PROVENANCE AND DEVICE MIGRATION NOT RUN** |
| Signed physical iPhone acceptance / rollback | [P01–P15 physical-device protocol](MILESTONE_1_PHYSICAL_DEVICE_ACCEPTANCE.md) | **NOT RUN** |

The synthetic native app was compiled and exercised in [run #43161667578](https://github.com/ashlynsloane/side-quest/actions/runs/43161667578), with all six integrated stages PASSED. Independent [run #43152426701](https://github.com/ashlynsloane/side-quest/actions/runs/43152426701) executed five focused jobs on that matching binary: **owner-recovery, generation-isolation, live-isolation and completed-history isolation PASSED**; the focused strength job **FAILED during QA profile-entry** because iOS entered the email into the name field, leaving email blank and Enter Beta disabled. It did **not** reach workout execution. This is separate from the six-stage native strength PASS. The original native focus-flag assertion was unreliable on iOS 26. The new exact name/email readback and enabled Enter Beta checks have **now passed in the current source-matched native strength, generation-isolation and both crash-kill jobs**. The earlier historical QA entry failure does not represent a current known strength-app defect. Native UI-only execution is permitted only when the full native
source fingerprint exactly matches the archived synthetic Release binary.


**Current native acceptance detail:** Updated six-stage Release [#43161667578](https://github.com/ashlynsloane/side-quest/actions/runs/43161667578) PASS. All **seven of seven** independent focused simulator jobs in [#43667407720](https://github.com/ashlynsloane/side-quest/actions/runs/43667407720) have completed successfully. Native code-source fingerprint was checked against the archived synthetic Release app, not inferred.

### Exact focused native evidence inventory

| Job | GitHub Actions result | Evidence artifact ID |
| --- | --- | --- |
| Strength restart and partial completion | PASS | 14142768918 |
| First-week generation A→B isolation | PASS | 14142729004 |
| In-progress workout A→B checkpoint isolation | PASS | 14142739118 |
| Embedded-owner mismatch and retry | PASS | 14142818993 |
| Real pre-SQL app SIGKILL and retry | PASS | 14143278319 |
| Real in-transaction app SIGKILL and rollback/retry | PASS | 14143082182 |
| Completed-history A→B→A isolation | PASS | 14144145444 |

All artifacts belong to native run #43667407720 and are synthetic-only. This closes the **simulator acceptance** checks, not signed physical-iPhone validation, real legacy-owner provenance, or release approval. This documentation-only commit requires independent exact-head CI before that new head can be called green.

## What the native evidence actually proves

The six integrated stages on #43161667578 executed, in sequence:

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

### Two real iOS workout-save crash windows — native PASS

Both independent native jobs completed successfully in
[run #43667407720](https://github.com/ashlynsloane/side-quest/actions/runs/43667407720).
These tests run **on an isolated synthetic iPhone simulator bundle** with two
different fake athletes and perform actual OS `kill -9`, not an ordinary
route change or graceful app stop.

- **After durable journal / before canonical SQL:** Evidence artifact
  `synthetic-ui-reused-binary-evidence-completion-kill`
  (GitHub artifact 14143278319) reports a verified exact QA app SIGKILL,
  zero pre-SQL workout/ledger rows and, after relaunch, exactly one matching
  partially completed workout/ledger pair with no fabricated sets.
  Both native JUnits and SQL postconditions PASS.
- **After real INSERT / before SQL COMMIT:** Evidence artifact
  `synthetic-ui-reused-binary-evidence-completion-in-transaction-kill`
  (GitHub artifact 14143082182) reports a verified exact QA app SIGKILL
  while `withTransactionAsync` was held after an uncommitted INSERT,
  full rollback to zero persisted workout/ledger rows, clean SQLite, and
  exactly one original sub-100% record after retry. Both JUnits and SQL
  postconditions PASS.

Neither test substitutes for **signed physical-iPhone P08a/P08b** or
authorizes any migration of historical real beta data.

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
| BOTH native iOS SIGKILL windows **PASS** with archived OS-kill/JUnit/SQLite evidence; signed physical-iPhone P08a/P08b remain NOT RUN | [Issue #13](https://github.com/ashlynsloane/side-quest/issues/13) |
| `generation-isolation` native JUnit and A/B SQLite postcondition PASSED; keep release integration tracked until approval | [Issue #19](https://github.com/ashlynsloane/side-quest/issues/19) |
| `owner-recovery` native JUnit and original-row/owner/SQLite postcondition PASSED; real historical owner provenance still separate | [Issue #15](https://github.com/ashlynsloane/side-quest/issues/15) |
| Document original owner provenance for any ambiguous historical real database, consistent restorable backup, deliberate migration and rollback | [Issue #15](https://github.com/ashlynsloane/side-quest/issues/15) |
| Execute P01–P15 on a signed physical iPhone and approve release/rollback plan | [Physical-device protocol](MILESTONE_1_PHYSICAL_DEVICE_ACCEPTANCE.md) |
| Keep [cloud guardrails PR #20](https://github.com/ashlynsloane/side-quest/pull/20) separate, staged and feature OFF | Out of Milestone 1 |

**Current decision: HOLD.** Do not merge PR #12, install a QA binary over
existing beta data, migrate actual files, or describe unexecuted tests as
passing. This document is an evidence snapshot, not an automatic release
authorization.
