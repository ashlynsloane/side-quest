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
7. Native Release simulator **all stages** pass and upload evidence for
   profile → first week → completed ride → restart. Add a native A→B
   switching case and interrupted workout recovery. A native build or
   script existing is not evidence that its steps passed.

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
- Native profile switch during first-week generation and genuine crash/relaunch
  with a pending partial completion remain acceptance gates.
- SQLite historical ownership ambiguity (issue #15), outstanding issues
  #13/#14/#19 native verification, and full signed-device release validation.
- PR #1 divergent branch requires a separate code audit, not an automatic merge.
- PR #20 cloud staging, reviewer/correction workflows and real two-device QA
  are deliberately out of scope for the local-first release.
