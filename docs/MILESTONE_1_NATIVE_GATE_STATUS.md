# Side Quest — Milestone 1: local-first native release acceptance

**Release candidate:** [PR #12](https://github.com/ashlynsloane/side-quest/pull/12) `test/automated-athlete-acceptance-v1`, directly targeting `sq2-experience-rebuild`.

**Decision:** **NOT RELEASED.** PR remains draft; do not merge, deploy, migrate historical athlete files or enable cloud feature flags. Synthetic identities only. This page records test **evidence**, not a claim that the installed beta was changed.

## Acceptance evidence (November 11, 2026)

| Test gate | Actual evidence | Result |
| --- | --- | --- |
| Planner/mobile typecheck, real SQLite acceptance, complete planner suite, iOS JS export | [Verified CI #43141207223](https://github.com/ashlynsloane/side-quest/actions/runs/43141207223), SHA `a0fd5549`, and [QA-gate source CI #43142441473](https://github.com/ashlynsloane/side-quest/actions/runs/43142441473) | **700/700 tests across 115 files PASS at `a0fd5549`; newer native-owner QA scripts require their own exact-head green result** |
| Synthetic local profile creation | [Native Release run #43114582364](https://github.com/ashlynsloane/side-quest/actions/runs/43114582364), QA binary from `80643966` | **PASS** |
| Generate and review first seven-day plan | Same native JUnit and screenshots | **PASS** |
| Save the actual 75-minute ride | Same native JUnit and screenshots | **PASS** |
| Kill/relaunch app and recover the saved ride | Same native JUnit and screenshots | **PASS** |
| Switch A→B, show B has no A history, switch B→A and recover A's original ride | Same native JUnit and screenshots | **PASS** |
| Strength workout → finish station → Leave → cold relaunch → Resume → Save partial → History detail | [Full Release run #43129525251](https://github.com/ashlynsloane/side-quest/actions/runs/43129525251) | **PASS; historical prior focused selector failures superseded by the complete six-stage native evidence** |
| Accessibility completion label and canonical detail-row assertion | [Full Release run #43129525251](https://github.com/ashlynsloane/side-quest/actions/runs/43129525251) | **PASS on compiled app source before subsequent auth-recovery additions; new auth source must be rebuilt** |
| A→B→A→B privacy isolation for **two paused strength workouts** | [Independent native UI-only run #43138494416](https://github.com/ashlynsloane/side-quest/actions/runs/43138494416), `live-isolation` scope and artifact `13909607956` | **PASS — JUnit 1 test, 0 failures; 3 required stages PASS; A and B's separate sessions restored with screenshots** |
| Source-matched full six-stage native Release | [Release iOS run #43129525251](https://github.com/ashlynsloane/side-quest/actions/runs/43129525251), original binary source SHA `b64b29f7` | **PASS — all six native Maestro stages; subsequent auth startup recovery changes require a rebuilt binary before exact-head signoff** |
| Synthetic owner-mismatch startup/retry + preserved SQLite data | `owner-recovery` native scope, SQL-backed count and PRAGMA quick_check after UI retry | **IMPLEMENTED / NOT YET NATIVE-VERIFIED.** A previous UI-only attempt refused an outdated binary; source-matched rerun pending |

### Specific native-strength failure and repair

Native failure snapshot `step-011-scrollUntilVisible-Start_workout.json/.png` shows the generated workout preview, the enabled **Start workout** button with native `accessibilityText: "Start workout, play"`, and the button within the viewport at approximately y=683–733. This is a *test selector mismatch*; it does not demonstrate an app-navigation, persistence or SQLite fault. The Maestro YAML now matches the observed native accessibility label and has a code-contract regression preventing the exact-text mistake.

The focused run completed the strength session and the real Training History screen displayed a saved **27% completion**, with no invented completed sets. Its final JUnit assertion could not see the child text because the parent Pressable supplied a shorter accessibility label. The app now exposes the completion percentage in the parent accessible label; the revised test asserts that value and opens the canonical history detail. The updated app-source binary **passed all six integrated native stages** in run #43129525251. Subsequent commits through `f68daf90` altered QA scripts, tests and documentation, not the compiled app-source fingerprint. The independent A→B→A→B live-session test subsequently **PASSED** in #43138494416. A later change to the auth startup recovery UI requires fresh exact-binary native acceptance.

Reuse of an existing Release binary is permitted only if `scripts/qa/native-source-fingerprint.mjs` verifies an exact match.

### Completed source-data integrity hardening

- Active workout and planned week state are athlete-scoped; authenticated route recovery redirects a hydrated athlete with no active session away from an orphaned `active-workout` route.
- A durable Leave write is required before navigating out of the active screen.
- Historical share summaries must label planned-dose equivalents as estimates rather than presenting paused wall-clock time as measured exercise.
- Historical shares cannot claim that prescribed exercises or muscle areas were completed without actual logged sets.
- SQLite ownership denial for ambiguous historical files is non-destructive. **This is not a user-data migration solution.**
- Legacy partial `completed_workouts` import retains the original fraction and planned exercise catalog, but no longer invents completed per-exercise sets; real-file migration/restart tests passed.
- Live strength completion is inside a verified-athlete database activation lock. New disk-backed race tests prove A completes to A even when B activation is queued, and stale A writes after B activation fail closed.
- A deliberate mid-transaction SQL failure plus cold module/database reload preserves the original 41% pending completion and forbids a 100% replay.
- A **real OS `SIGKILL`** of a separate Node SQLite writer while its database transaction is open rolls back the uncommitted row; a cold restart of the mobile database service recovers the original **43% pending dose**, retries once and refuses to promote it to 100%. This validates filesystem/SQLite crash behavior, **NOT** forced termination inside the native iOS save callback.

### Consistent synthetic legacy SQLite backup rehearsal

The new `scripts/qa/backup-synthetic-legacy-sqlite.mjs` requires explicit
`SIDEQUEST_QA_SYNTHETIC_BACKUP=1` and synthetic input/output fixture names,
refuses missing or existing destination files, and uses Node SQLite's online
backup API rather than copying the `.db` file without its committed WAL.
It verifies `PRAGMA quick_check` and publishes the validated snapshot
using an atomic no-overwrite hard link, then removes its temporary copy.
`packages/planner/test/synthetic-legacy-backup.test.ts` passed in
[CI #43137896412](https://github.com/ashlynsloane/side-quest/actions/runs/43137896412):
the snapshot includes a committed row that remained in WAL, preserves the
source database and WAL hashes, and rejects missing authorization, bad
filenames and overwrites. This is a **synthetic backup protocol rehearsal**,
not a migrated or owner-recovered iPhone file.

### Seventh independent native privacy gate

The six-stage integrated gate still tests completed ride/history isolation. A separate `live-isolation` scope now checks athlete A's **paused in-progress workout**, A→B absent-from-B state, B's own paused workout, A's original restored station, and B's original restored station after A→B→A→B switches and a cold relaunch. The `live-isolation` result is recorded separately and cannot make the core six-stage JUnit pass if anything there fails. The isolated live-workout privacy test **PASSED**: run #43138494416, archived `live-isolation-junit.xml` (1 test, 0 failures), `native-ui-summary.json` (`allPassed: true`), and screenshots from both original paused workout recovery paths.

### Read-only legacy owner audit (diagnostic, not migration)

`scripts/qa/audit-legacy-owner.mjs` opens a given synthetic SQLite file read-only, checks SQLite integrity and embedded owner metadata, and reports only owner-verification status and WAL sidecar presence—not athlete IDs or training rows. `packages/planner/test/legacy-owner-audit.test.ts` verifies matched, mismatched, unmarked and missing databases, including unchanged file hashes. A populated database without independently verified ownership remains **DENIED**. A fail-closed startup recovery view and an explicitly synthetic native owner-mismatch test are now implemented. The native `owner-recovery` gate has **not yet passed**; real iPhone recovery and any owner-verified production migration remain unverified and release-blocking.

## Still required before Milestone 1 can be signed off

1. **Exact-match native full six-stage execution: PASSED on run #43129525251.** Preserve its six JUnit results/screenshots and verify native source fingerprint on any later app-source edits. Focused scopes cannot replace this integrated evidence.
2. **Native interrupted completion:** a process termination *during* pending journal / canonical SQLite completion and recovery with the original fraction/timestamp and no dose duplication. Merely stopping the app after the Leave checkpoint is not equivalent. Track in [issue #13](https://github.com/ashlynsloane/side-quest/issues/13).
3. **Native profile switch mid-generation:** switch accounts while A's onboarding evaluation or persistence is pending and prove no A state reaches B. Disk-backed tests already exist; native confirmation remains in [issue #19](https://github.com/ashlynsloane/side-quest/issues/19).
4. **Legacy SQLite ownership/migration:** conservative byte-preserving backup and original-owner verification for untagged historical files, collision/reset cases and rollback, [issue #15](https://github.com/ashlynsloane/side-quest/issues/15). Current fail-closed denial must not be weakened just to accept old data.
5. **Physical iPhone acceptance and release authorization:** offline/relaunch, interaction/accessibility, completed-dose integrity, sign-in/out and rollback. Use [the signed-device protocol](MILESTONE_1_PHYSICAL_DEVICE_ACCEPTANCE.md), whose scenarios are all explicitly **NOT RUN**. Do not treat simulator compilation or Expo JS export as device validation.
6. **Explicit release decision:** only after evidence, privacy and migration review, and signed-device acceptance. Do not auto-merge draft PR #12.

## Deliberately out of Milestone 1

[Cloud guardrails PR #20](https://github.com/ashlynsloane/side-quest/pull/20) remains **draft/feature OFF**, requiring independent Supabase staging and authenticated two-device validation. The separate generalized rehab and UX branches are not implicitly incorporated by a passing core acceptance.

## Operational checks

- Planner and source QA: `.github/workflows/automated-athlete-acceptance.yml` on the **exact candidate SHA**.
- Full native Release binary + six-stage Maestro: `.github/workflows/native-ios-simulator-smoke.yml`.
- Reuse previously compiled binary only with exact source SHA-256 match: `.github/workflows/native-ios-ui-only.yml`, including independent `live-isolation` and `owner-recovery` scopes. Only `full` constitutes the integrated six-stage gate. The `owner-recovery` gate additionally verifies unaltered synthetic plan-row counts, mismatched owner marker, and `PRAGMA quick_check` after native retry.
- Review six individual `maestro-evidence/{stage}-junit.xml` reports and `native-ui-summary.json`; absence/skips are FAIL/NOT_REQUIRED, never PASS.
- No real-athlete data in committed fixtures, log artifacts or screenshots.

**Rule:** update this snapshot only after reading the actual run status and evidence. Do not infer native outcomes from source/tests alone.
