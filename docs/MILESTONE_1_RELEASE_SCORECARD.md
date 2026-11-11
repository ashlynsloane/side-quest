# Side Quest — Milestone 1 release scorecard

**Milestone:** A reliable, private, local-first multisport training app
**Owner-facing decision:** NOT READY FOR MERGE OR BETA DEPLOYMENT
**Canonical integration:** Draft PR #12 → `sq2-experience-rebuild`
**Snapshot date:** 2026-11-11

This file is the single operational checklist for Milestone 1. It supersedes
vague progress claims but does not replace detailed technical incident notes
in `RELEASE_INTEGRATION_CONTROL.md`.

## What "done" means

An isolated athlete can create a profile, generate and review an appropriate
week, log actual training, execute or end a strength workout early, safely
restart, recover the original records and dose, and switch between local
athletes without leaking or overwriting their histories. The real iOS
experience must demonstrate these behaviors, not just unit tests.

## Evidence-based gates

| Gate | Status | Verified evidence / required proof |
| --- | --- | --- |
| Planner and app typechecks, complete deterministic regression suite, real disk-backed SQLite and iOS JS bundle | **PASS (source)** | SHA `17366e38`, [CI 43108986534](https://github.com/ashlynsloane/side-quest/actions/runs/43108986534): 675/675 tests, 111 files, all typechecks and export green |
| Build and launch isolated Release iOS simulator app | **PASS (native)** | [Native build 42959140988](https://github.com/ashlynsloane/side-quest/actions/runs/42959140988); verified app artifact `sidequest-synthetic-ios-app`; synthetic identity only |
| iOS create profile and first-week onboarding | **PASS (native)** | Native JUnit stages `profile`, `onboarding` passed in run 42959140988 |
| iOS log completed 75-minute bike | **PASS (native)** | `ride` native JUnit passed in run 42959140988 |
| Cold restart keeps that actual 75-minute bike in Training History | **PASS (native)** | [UI-only run 43057598937](https://github.com/ashlynsloane/side-quest/actions/runs/43057598937) executed and passed the real cold-restart/history/detail check against a verified source-matched Release app |
| Real A → B → A account-history isolation | **PARTIAL NATIVE EVIDENCE; FAIL AT B→A NAVIGATION** | [UI-only run 43062375569](https://github.com/ashlynsloane/side-quest/actions/runs/43062375569): B profile onboarding completed; B's History had 0 records and “No training records yet”. QA then sought a tab from the full-screen History subpage, which hides tabs. Corrected to Go back then select Profile; A's original ride awaits native confirmation. |
| Interrupted strength workout, process restart, resume and partial-completion history | **BLOCKED/UNVERIFIED (native)** | Sixth staged Maestro journey. Source-level and SQLite tests exist; no successful native end-to-end evidence yet |
| Profile switch *during* first-week write/generation | **UNVERIFIED (native)** | Source/SQLite fence tests only; distinct in-flight native switch test required |
| Crash *during* pending completion / SQLite commit | **UNVERIFIED (native)** | Fail-closed immutable journal and idempotency tests exist; force-terminate at the actual injection point required |
| Historical populated SQLite file owner/migration safety | **PARTIAL** | Byte-for-byte fail-closed denial tested. Backup/owner resolution for existing beta data not yet approved |
| Native signed-device UX, permissions, rollback/restore | **UNVERIFIED** | Must be reviewed on an actual supported device with a controlled synthetic profile |
| Final privacy and release review | **NOT STARTED** | No merge or beta deployment authorized |

## Work policy

1. Fix **the earliest failing native stage** using its JUnit, screen
   hierarchy and screenshot. Never infer data loss from a missing text node.
2. Reuse the source-fingerprint-matched binary for QA-only selector fixes;
   rebuild native only when app/build inputs truly change.
3. Record exact PASS/FAIL/BLOCKED status and run URL after each test.
4. Keep one active integration PR (#12). Do not start cloud (#20), rehab
   (#2), visual-reference (#4) or diverged planning (#1) integration here.
5. A passing test must include an executed native journey and durable
   evidence; `NOT_RUN`, `BLOCKED` and absent JUnit are NOT passes.
6. Do not present Milestone 1 as complete without physical-device/owner
   acceptance, documented rollback and review of legacy local files.
7. No production credentials, real user workout records or cloud migrations
   belong in synthetic CI.

## Current action

Native UI-only rerun [43057598937](https://github.com/ashlynsloane/side-quest/actions/runs/43057598937)
passed stages 1–4 (profile, onboarding, 75-minute ride, cold restart),
then FAILED before the fifth athlete-switch could begin: the final
restart step had already returned to Today, where no “Go back” button existed.
The screenshot confirms all tabs including Profile were available. The
isolation and strength scripts now use destination tab IDs rather than
assuming router.back() history. **This correction is pending native rerun.**

Next: inspect [native run 43062375569](https://github.com/ashlynsloane/side-quest/actions/runs/43062375569) stage evidence after completion. Do not claim A→B→A or strength completion until the respective executed JUnit results PASS.

## Second native isolation attempt — run 43062375569

Four leading native journeys passed. Stage 5 created and onboarded synthetic
athlete B and showed B's empty Training History (zero records, screenshot
and accessibility evidence). The stage then failed solely at navigation:
it attempted to select the Profile tab while inside full-screen History,
where the tab bar is hidden. The fix uses the visible `Go back` control
first, then selects the native Profile tab. At stage exit, it now returns
from A's Activity detail through History to the tab shell before strength
acceptance. This is **partial B-isolation evidence**, not yet a complete
A→B→A PASS. A's restored history and strength recovery remain unverified.

## Third native acceptance attempt — rerun 43076034600

Native evidence from completed [run 43062375569](https://github.com/ashlynsloane/side-quest/actions/runs/43062375569):
profile, onboarding, 75-minute ride and cold restart each **PASS**. On the
fifth journey, athlete B was created and onboarded, and B's History showed
**zero records**. The native screenshot at the failure confirms the app was
still on B's full-screen History route, which hides the bottom tabs.
The test incorrectly asked for `sidequest-qa-profile-tab` without leaving
History. This is a **navigation-only failure**, not evidence of data leakage.

Commit `2fcd8913` adds the actual `Go back` transition before switching
B→A and exits A's History to the tab shell before strength testing.
The source-matched six-stage [native UI-only rerun 43076034600](https://github.com/ashlynsloane/side-quest/actions/runs/43076034600)
was **QUEUED at this snapshot**, not a native pass. Exact-head
[automated acceptance 43076047266](https://github.com/ashlynsloane/side-quest/actions/runs/43076047266)
completed **SUCCESS**, preserving 110 passing regression test files and
planner/mobile typecheck and iOS JS export.

## Intermittent native transport failure — run 43076034600

The third native UI-only run did **not** reach the A→B→A gate. Profile
creation PASSED; the onboarding stage failed at its `launchApp`
command with `DeviceUnreachableException` during XCTest `setPermissions`
(transport refused `127.0.0.1`). The archived Maestro command trace shows
only define variables, app configuration and a RUNNING launchApp; **no
onboarding UI interaction or app assertion executed**. Ride, restart,
isolation and strength remained BLOCKED. This is test-driver infrastructure
failure, not demonstrated application regression.

One narrowly guarded infrastructure retry is now allowed *per stage* only
when both the JUnit contains a known XCTest transport error and the native
command record proves no UI interaction occurred. Original failed logs and
JUnit are retained; any actual tap, assertion, ambiguous command trace or
second transport failure ends in FAIL. Added a deterministic helper test.
This needs fresh native execution; no gate status is upgraded by code alone.

### Exact-head acceptance verification after transport retry

[Run 43094606055](https://github.com/ashlynsloane/side-quest/actions/runs/43094606055),
commit `cf08c7cb`: **SUCCESS**. Full planner regression 672/672 tests
in 111 files; synthetic journey tests 23/23 and real mobile SQLite tests
29/29; planner/mobile typechecks and iOS JS export passed. Native iOS
UI-only [run 43094446036](https://github.com/ashlynsloane/side-quest/actions/runs/43094446036)
remained **QUEUED at this snapshot**. No A→B→A or strength native PASS
can be inferred from this code-level CI.

## Focused native acceptance (2026-11-11)

The prior [native run 43094446036](https://github.com/ashlynsloane/side-quest/actions/runs/43094446036)
**FAILED before simulator boot**: GitHub returned HTTP 502 downloading the
verified Release binary artifact. This is an external artifact-service
failure, **not** a failed app assertion. [Automated acceptance 43095049768](https://github.com/ashlynsloane/side-quest/actions/runs/43095049768)
ran all planner/typecheck/mobile/JS validations, but final artifact upload
failed with an upstream HTML response; preserve the previous source CI
pass rather than misclassifying product logic.

Independent source-matched simulator suites now exist via `NATIVE_QA_SCOPE`:
- `strength`: fresh synthetic profile → onboarding → interrupted/restarted
  strength session → partial completion, **without any ride/A→B dependency**
- `isolation`: fresh synthetic profile → onboarding → saved 75-minute ride
  → cold restart → A→B→A profile isolation, **without the strength stage**
- `full`: original mandatory six-stage integration journey

Automatic QA-only branch pushes schedule separate `strength` and
`isolation` simulator jobs, each in a clean environment. Manual dispatch
still supports `full`. The stage evidence JSON records a strict scope,
required stages, and `NOT_REQUIRED` instead of falsely passing omitted
stages. **A focused PASS never qualifies the full milestone release gate.**
Artifact downloads are retried up to 4 times on transient GitHub failures;
matching native source fingerprint is still mandatory. Executed native
results pending.

### Focused native verification — CI evidence, November 11

- The focused two-job [simulator run 43108702041](https://github.com/ashlynsloane/side-quest/actions/runs/43108702041) launched a **strength** job and an **isolation** job in separate simulator environments. Both had reached simulator/app setup; final native JUnit status was **pending** at this snapshot. This proves orchestration started, not that either journey passed.
- The focused QA source initially failed one outdated assertion about the legacy `99=blocked` text. The contract now requires the new explicit `99=not run/blocked` status. No iOS binary sources changed.
- Exact-head [CI 43108986534](https://github.com/ashlynsloane/side-quest/actions/runs/43108986534), SHA `17366e38`, **SUCCESS**: 675/675 regression tests across 111 files, including the newly added scoped native-evidence policy tests, typechecks, mobile SQLite acceptance, and iOS JavaScript export.
- Full six-stage integration remains a required separate gate and has **not** been qualified by focused-test source code or queued jobs.
