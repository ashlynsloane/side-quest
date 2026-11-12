# Side Quest — Milestone 1 authoritative native acceptance record

**Status as of November 11, 2026 (local U.S. time): DRAFT / NOT RELEASED.**

**Canonical candidate:** [PR #12](https://github.com/ashlynsloane/side-quest/pull/12),
`test/automated-athlete-acceptance-v1`, targeting `sq2-experience-rebuild`.
No merge, installation, actual-athlete data access, Supabase migration,
cloud-feature enablement, or beta distribution is authorized by passing CI.

## Verified evidence versus pending acceptance

| Gate | Verified evidence | Status |
| --- | --- | --- |
| Planner/mobile typecheck, actual mobile SQLite, full regression, iOS JS export | [CI #43147658452](https://github.com/ashlynsloane/side-quest/actions/runs/43147658452), `12208837` | **PASS — 710/710 tests, 116 files** |
| Integrated six-stage native Release athlete journey | [Native #43141133431](https://github.com/ashlynsloane/side-quest/actions/runs/43141133431), source `fc2a05c6`. Six stage-specific Maestro JUnit results all pass | **PASS**; later synthetic generation-race source requires a newer binary |
| Separate A→B→A→B in-progress strength checkpoint isolation | [Native #43138494416](https://github.com/ashlynsloane/side-quest/actions/runs/43138494416), `live-isolation` JUnit (1 test, 0 failures), `allPassed=true`, archived screenshots | **PASS** on its compiled source; reverify with new build |
| Synthetic owner-mismatch startup and retry on actual simulator | `owner-recovery` scope checks visible denial, failed retry, unchanged training-block count, embedded owner marker, and `PRAGMA quick_check` | **NOT YET NATIVE-VERIFIED**; older UI-only run refused an incompatible binary before app launch |
| Synthetic A→B switch while A's generated first week is waiting to persist | `generation-isolation` scope; synthetic A holds after calculation; barrier releases only after verified B activation, then actual A/B SQLite goals/blocks and integrity are checked | **NOT YET NATIVE-VERIFIED**; source test and contract complete |
| iOS process termination during pending workout completion + recovery | Node disk-backed SQLite OS `SIGKILL` / transaction rollback test, unchanged 43% pending journal and no 100% replay | **DISK-BACKED TEST PASS; TRUE NATIVE KILL STILL NOT RUN** |
| Historical legacy database provenance and migration with rollback | Read-only legacy owner audit; consistent synthetic SQLite online/WAL backup rehearsal with original hashes unchanged | **AUDIT/BACKUP PASS; HUMAN-VERIFIED PROVENANCE AND DEVICE MIGRATION NOT RUN** |
| Signed physical iPhone acceptance / rollback | [P01–P15 physical-device protocol](MILESTONE_1_PHYSICAL_DEVICE_ACCEPTANCE.md) | **NOT RUN** |

The most recent source-matched native build for the new generation-race
instrumentation is [run #43147554597](https://github.com/ashlynsloane/side-quest/actions/runs/43147554597).
Its result must be read from actual JUnit and screenshots, not inferred from
source CI. Native UI-only execution is permitted only when the full native
source fingerprint exactly matches the archived synthetic Release binary.

## What the native evidence actually proves

The six integrated stages on #43141133431 executed, in sequence:

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
The latest independent result was one `live-isolation` JUnit case with zero
failures plus prerequisite profile/onboarding passes. Do not call this the
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
file must contain its own goal and training block; both embedded owners and
`PRAGMA quick_check` must be correct. Missing JUnit, skipped steps,
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

## Remaining release blockers and owner action

| Blocker | Tracking |
| --- | --- |
| Real native iOS SIGKILL while canonical completion is pending, then restart/repair with original dose and no duplicate | [Issue #13](https://github.com/ashlynsloane/side-quest/issues/13) |
| Run/inspect native `generation-isolation` JUnit plus actual A/B SQL postcondition | [Issue #19](https://github.com/ashlynsloane/side-quest/issues/19) |
| Run/inspect native `owner-recovery` JUnit plus original-row/owner/SQLite postcondition | [Issue #15](https://github.com/ashlynsloane/side-quest/issues/15) |
| Document original owner provenance for any ambiguous historical real database, consistent restorable backup, deliberate migration and rollback | [Issue #15](https://github.com/ashlynsloane/side-quest/issues/15) |
| Execute P01–P15 on a signed physical iPhone and approve release/rollback plan | [Physical-device protocol](MILESTONE_1_PHYSICAL_DEVICE_ACCEPTANCE.md) |
| Keep [cloud guardrails PR #20](https://github.com/ashlynsloane/side-quest/pull/20) separate, staged and feature OFF | Out of Milestone 1 |

**Current decision: HOLD.** Do not merge PR #12, install a QA binary over
existing beta data, migrate actual files, or describe unexecuted tests as
passing. This document is an evidence snapshot, not an automatic release
authorization.
