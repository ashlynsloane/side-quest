# Side Quest — integration control and release roadmap

**Decision date:** 2026-11-10
**Canonical integration target:** `sq2-experience-rebuild` (repository default branch)
**Active local-first release candidate:** PR #12, `test/automated-athlete-acceptance-v1`
**Status:** draft / not merged / not deployed. No installed beta changes.

## Why this exists

An eight-PR stack (#5–#12) obscured progress. All seven predecessor PR heads
(#5–#11) are **ancestors** of #12, verified using GitHub compare with
`behind_by=0` for each. The release candidate therefore retains their commits,
tests, and code. The seven predecessor discussions may be closed as
**superseded, not merged** while keeping all source branches and Git history.
PR #12 must be retargeted directly at `sq2-experience-rebuild` to provide the
one complete local-first change review.

## Five coherent workstreams

| Workstream | PR | Decision | Integration requirement |
| --- | --- | --- | --- |
| Local-first core training: capacity, provenance, baseline/plan review, real SQLite, onboarding, sessions, interrupted-workout recovery and native QA | #12 | **Only active integration/release candidate.** All former #5–#11 work already included | Green planner/mobile CI, native iOS synthetic athlete journey, persisted-restart state, profile isolation, historical-owner migration safety |
| Synchronized cross-device recovery and workout ceilings | #20 | **Parked; feature OFF** | Separate Supabase staging project and real authenticated two-device QA, review/correction workflows, explicit safety approval |
| Generalized injury and rehabilitation | #2 | Separate experiment, not a release dependency | Integrate after local-first core, audit overlapping database/planner/Week files, safety and native PT gates |
| Product/UX blueprint and prototypes | #4 | Independent design reference, not a software release blocker | Review proposals against the actual core app; later integrate only selected changes |
| Older multisport planning-core branch | #1 | **Quarantined for reconciliation; do not merge** | Branch has diverged by hundreds of commits and contains a large cross-cutting diff; perform file/behavior inventory and isolate unique additions first |

The cloud (#20) and rehab (#2) branches both touch core app/database
files. GitHub compare shows six shared paths between #12 and #20, three
between #12 and #2. Do **not** merge these in parallel without explicit
integration tests and a review of conflict semantics.

## Release milestone gates

### Gate A — local-first behavior (active)

1. One isolated synthetic account can finish onboarding and see a generated
   proposed seven-day plan with unknown history clearly marked unknown.
2. Starting a **planned** strength session keeps its original plan identity.
   A partial completion persists the original fraction/time, and an
   idempotent retry cannot inflate dose.
3. A completed ride has its true 75-minute duration with unknown distance.
   After an actual cold relaunch it remains visible in training history.
4. Switching athletes mid-generation or during a write cannot write another
   athlete's goals, workout, equipment, plan or state to the new athlete file.
5. Interrupted and ambiguous legacy SQLite ownership fails closed
   non-destructively. No user data are migrated by CI.
6. A **single CI run on the candidate SHA** passes planner regression, actual
   mobile SQLite tests, planner/mobile typechecks and iOS JavaScript export.
7. Native Release simulator **all six stages** pass and upload JUnit/
   accessibility/screenshot evidence for profile → first week → completed
   ride → restart → A→B→A history isolation → strength pause/relaunch/
   partial-save. Mid-generation native switching and a forced termination
   *during* pending partial-completion commit remain additional required
   checks. A native build or script existing is not passing proof.

**Evidence snapshot:** On 2026-11-10, the core CI run for
`5d3967739ce9e86f63e026907cbbe3ea38dfdf3f` passed:
https://github.com/ashlynsloane/side-quest/actions/runs/42921739311.
The native run for `03415107210b3a7bf6b163fbd2e47926bb9e77d5`
**failed at the restart/history screen** after profile, onboarding,
and ride passed (https://github.com/ashlynsloane/side-quest/actions/runs/42921655590).
The failed run was on an earlier SHA and does not qualify the latest head.
Review newer evidence before changing the release assessment.

### Gate B — coherent product experience

Review Today, Week, Train, workout preview, execution, completed history,
and explicit plan adjustment UX in a reproducible desktop/mobile HTML
prototype. Compare with the actual app and use a deterministic QA athlete.
Do not allow the prototype to substitute for native or database tests.

### Gate C — pilot/beta release

Review code, privacy/account separation, historical SQLite ownership
migration, deployment/rollback procedure and minimum native-device tests.
Only then mark PR #12 ready for review or merge it to the designated target.
Do not infer injury clearance or clinically validated ramp limits.

### Gate D — staged extension

After the core is qualified, independently integrate selected rehab work
and cloud training guardrails, with staging and two-device testing for cloud.
Do not enable cloud feature flags as a by-product of code consolidation.

## Pull-request and branch policy

- **One active integration PR per release milestone**, directly targeting
  `sq2-experience-rebuild`. Development can use short-lived branches and
  PRs for review, but they must be merged/closed before opening the next
  release milestone; do not maintain another open multi-PR stack.
- **Never create a new draft PR just to say work is in progress.** Record
  intermediate findings, checklists, tests and release evidence in the
  canonical PR and this document.
- A branch name is not a release. CI green is not native QA green;
  neither means an installed beta changed.
- For each gate, record the **exact SHA**, command/workflow, real output and
  PASS/FAIL/BLOCKED. Mark unrun tests explicitly unverified.
- Do not rewrite or delete historical branches during cleanup; closing a
  superseded PR is a reversible organizational action, not a merge or
  deployment. Reopen it if ancestry or scope assumptions prove wrong.
- Any future cloud, rehab or architectural merger needs a **fresh comparison**
  against the current candidate and an explicit conflict/resolution plan.
- Do not add real user training records or credentials to test fixtures.

## Current technical blockers (not solved by PR cleanup)

- Native UI restart journey fails before confirming Training History; inspect
  screenshot/accessibility hierarchy to distinguish selector/navigation failure
  from actual missing activity.
- Native A→B→A history isolation is now a mandatory fifth stage, but it
  remains unverified until an actual matching native simulator run passes.
  A switch *during* first-week generation and genuine crash/relaunch with
  a pending partial completion remain separate acceptance gates.
- SQLite historical ownership ambiguity (issue #15), outstanding issues
  #13/#14/#19 native verification, and full signed-device release validation.
- PR #1 divergent branch requires a separate code audit, not an automatic merge.
- PR #20 cloud staging, reviewer/correction workflows and real two-device QA
  are deliberately out of scope for the local-first release.

## Native restart incident: verified cause and targeted correction

The [November 10 isolated iOS run](https://github.com/ashlynsloane/side-quest/actions/runs/42921655590)
passed **profile**, **onboarding**, and **completed ride**, but failed the
**restart** stage before entering Training History.

Downloaded the full archived native JUnit, Maestro command sequence, failure
screenshot, and accessibility hierarchy. The failure hierarchy showed:

- The "Inspect full training history" element was at
  `[38,828][224,861]`.
- The Week tab occupied `[80,807][160,864]`; the other bottom tabs also
  occupied this fixed bottom row. The test's History target therefore lay
  beneath the tab bar. Maestro regarded it as visible and reported a
  successful `tapOn`, but the screen never navigated away from Week.
- The assertion `"Training history" is visible` failed because the History
  route was not entered. **No assertion was made about the saved bike after
  restart**, and missing data is not an established cause.

Code changes in the single PR #12 release candidate:

1. Promote Training History to the first action in Week's training-evidence
   card; provide stable `sidequest-qa-open-training-history` test ID.
2. Use Maestro `scrollUntilVisible` with `centerElement: true` to keep the
   link away from fixed tabs, record a pre-tap screenshot, tap the stable ID,
   and demand the History route plus the original 75-minute ride.
3. Add source-contract regression tests for the accessible navigation and
   diagnostic unit tests which identify a History target occluded by tab-bar
   bounds. Native QA must not classify this failure as data loss.

**Verification classification:** code-level acceptance runs are separate
from native simulator results. Until a new four-stage native run confirms
History after cold relaunch, this gate remains unverified.

## Current local-first hardening additions (November 11)

- **Native cross-athlete isolation:** New fifth staged Maestro flow uses real
  local profile sign-out/sign-in and expects B's training history to be empty
  while A's original 75-minute bike survives switching back. All five JUnit
  results are required; source files and scripts alone are not native evidence.
  Stable accessible profile-tab and sign-out IDs avoid iOS composite-label
  selector brittleness.
- **Pending partial completion protection:** A new workout preview cannot
  replace a previously journaled, unsaved partial dose. The provider checks
  localStorage *before* replacing in-memory workout state; the preview
  surfaces a recovery instruction. Direct session persistence rejects
  conflicting replacements, while stale writes for the same session remain
  no-ops. Malformed checkpoints are retained and cannot be overwritten
  automatically. SQLite/adapter tests cover 29–31% partial completion,
  sign-out and cold restart across A/B profiles.
- **Legacy SQLite no-write denial:** The owner check now performs a
  read-only `sqlite_master` inspection before creating its ownership table.
  When an old populated file lacks independently verifiable ownership,
  activation refuses to adopt the file without modifying its bytes.
  A new disk-backed test compares the entire original SQLite file
  byte-for-byte after rejection.
- **Remaining:** Actual native iOS release acceptance for these changes,
  documented historical-owner migration/backup for legitimately old data,
  a native force-quit with an in-flight completion save, and physical-device
  verification. Do not mark those gates passed based on source or CI alone.

## Restored workout discoverability and end-to-end native strength coverage

The app already persisted work/rest state in a profile-scoped local checkpoint,
but Home and Train did not expose a way to return to it after a cold process
relaunch. Both screens now conditionally show the existing reusable
`ActiveWorkoutResumeCard` whenever the active workout provider has restored
an authenticated athlete's session. Its stable native QA selector is
`sidequest-qa-resume-active-workout`.

A sixth mandatory synthetic iOS journey leaves an active quick workout,
relaunches the process, reopens the checkpoint from Today and saves a partial
completion without claiming full credit. This is **scripted but not native
verified** until all six stage JUnit reports and screenshots pass. A crash
between journal and canonical ledger persistence requires a separate
injection test and remains an explicit release blocker.

## Partial-workout reporting integrity and Leave checkpoint failure handling

The active completion screen no longer substitutes the full planned time for
an early-ended workout. A shared pure helper derives active credited seconds
from the original immutable completion fraction and planned duration, so a
25% completion of a 40-minute plan is displayed as 10 minutes, not 40.
The athlete sees **PARTIAL WORKOUT** and an explicit fraction. This is a
planned-duration-equivalent, not an independent stopwatch-based measurement.

The Leave action now waits for the local checkpoint write and stays on the
active workout with a visible retry message if that write fails. Incomplete
workouts with no per-exercise set logs no longer create synthetic completed
sets for *every* exercise. Historical records are unchanged; this is a
forward-only recording correction, not a migration. The exact real-device
reliability of both changes requires native verification before release.
