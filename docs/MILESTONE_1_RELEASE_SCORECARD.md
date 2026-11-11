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
| Planner and app typechecks, complete deterministic regression suite, real disk-backed SQLite and iOS JS bundle | **PASS (source)** | SHA `6cf98981`, [CI 43062385131](https://github.com/ashlynsloane/side-quest/actions/runs/43062385131): 669/669 tests, 110 files, all typechecks and export green |
| Build and launch isolated Release iOS simulator app | **PASS (native)** | [Native build 42959140988](https://github.com/ashlynsloane/side-quest/actions/runs/42959140988); verified app artifact `sidequest-synthetic-ios-app`; synthetic identity only |
| iOS create profile and first-week onboarding | **PASS (native)** | Native JUnit stages `profile`, `onboarding` passed in run 42959140988 |
| iOS log completed 75-minute bike | **PASS (native)** | `ride` native JUnit passed in run 42959140988 |
| Cold restart keeps that actual 75-minute bike in Training History | **PASS (native)** | [UI-only run 43057598937](https://github.com/ashlynsloane/side-quest/actions/runs/43057598937) executed and passed the real cold-restart/history/detail check against a verified source-matched Release app |
| Real A → B → A account-history isolation | **FAILED: NAVIGATION PRECONDITION (native); RETEST RUNNING** | [UI-only run 43057598937](https://github.com/ashlynsloane/side-quest/actions/runs/43057598937): first 4 stages PASS; isolation expected nonexistent “Go back” on Today. Native screenshot shows Profile tab available. QA now uses stable Profile tab ID; [retest 43062375569](https://github.com/ashlynsloane/side-quest/actions/runs/43062375569) running at snapshot. No A→B→A data claim yet |
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
