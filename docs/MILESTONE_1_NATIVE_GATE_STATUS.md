# Side Quest — Milestone 1: local-first native release acceptance

**Release candidate:** [PR #12](https://github.com/ashlynsloane/side-quest/pull/12) `test/automated-athlete-acceptance-v1`, directly targeting `sq2-experience-rebuild`.

**Decision:** **NOT RELEASED.** PR remains draft; do not merge, deploy, migrate historical athlete files or enable cloud feature flags. Synthetic identities only. This page records test **evidence**, not a claim that the installed beta was changed.

## Acceptance evidence (November 11, 2026)

| Test gate | Actual evidence | Result |
| --- | --- | --- |
| Planner/mobile typecheck, real SQLite acceptance, complete planner suite, iOS JS export | [Exact-source CI #43114621647](https://github.com/ashlynsloane/side-quest/actions/runs/43114621647), SHA `1fcf27c7` | **PASS — 683/683 tests, 112 files** |
| Synthetic local profile creation | [Native Release run #43114582364](https://github.com/ashlynsloane/side-quest/actions/runs/43114582364), QA binary from `80643966` | **PASS** |
| Generate and review first seven-day plan | Same native JUnit and screenshots | **PASS** |
| Save the actual 75-minute ride | Same native JUnit and screenshots | **PASS** |
| Kill/relaunch app and recover the saved ride | Same native JUnit and screenshots | **PASS** |
| Switch A→B, show B has no A history, switch B→A and recover A's original ride | Same native JUnit and screenshots | **PASS** |
| Strength workout → finish station → Leave → relaunch → Resume → Save partial → History shows nonzero, below 100% | Same native run | **FAIL BEFORE START** at an exact accessibility selector; entire remainder **UNVERIFIED** |
| Focused native strength and isolation rerun | [UI-only run #43127249398](https://github.com/ashlynsloane/side-quest/actions/runs/43127249398) | **RUNNING at this checkpoint; inspect JUnit before updating status** |

### Specific native-strength failure and repair

Native failure snapshot `step-011-scrollUntilVisible-Start_workout.json/.png` shows the generated workout preview, the enabled **Start workout** button with native `accessibilityText: "Start workout, play"`, and the button within the viewport at approximately y=683–733. This is a *test selector mismatch*; it does not demonstrate an app-navigation, persistence or SQLite fault. The Maestro YAML now matches the observed native accessibility label and has a code-contract regression preventing the exact-text mistake.

The new test-only changes do not alter the app-source fingerprint; reuse of an existing Release binary is permitted only if `scripts/qa/native-source-fingerprint.mjs` verifies an exact match.

### Completed source-data integrity hardening

- Active workout and planned week state are athlete-scoped; authenticated route recovery redirects a hydrated athlete with no active session away from an orphaned `active-workout` route.
- A durable Leave write is required before navigating out of the active screen.
- Historical share summaries must label planned-dose equivalents as estimates rather than presenting paused wall-clock time as measured exercise.
- Historical shares cannot claim that prescribed exercises or muscle areas were completed without actual logged sets.
- SQLite ownership denial for ambiguous historical files is non-destructive. **This is not a user-data migration solution.**

## Still required before Milestone 1 can be signed off

1. **Exact-match native full six-stage execution:** one six-stage Release simulator run with all six PASS and complete JUnit, hierarchy and screenshot artifacts. Focused `strength` or `isolation` passes alone do not satisfy the integrated six-stage gate.
2. **Native interrupted completion:** a process termination *during* pending journal / canonical SQLite completion and recovery with the original fraction/timestamp and no dose duplication. Merely stopping the app after the Leave checkpoint is not equivalent. Track in [issue #13](https://github.com/ashlynsloane/side-quest/issues/13).
3. **Native profile switch mid-generation:** switch accounts while A's onboarding evaluation or persistence is pending and prove no A state reaches B. Disk-backed tests already exist; native confirmation remains in [issue #19](https://github.com/ashlynsloane/side-quest/issues/19).
4. **Legacy SQLite ownership/migration:** conservative byte-preserving backup and original-owner verification for untagged historical files, collision/reset cases and rollback, [issue #15](https://github.com/ashlynsloane/side-quest/issues/15). Current fail-closed denial must not be weakened just to accept old data.
5. **Physical iPhone acceptance and release authorization:** offline/relaunch, interaction/accessibility, completed-dose integrity, sign-in/out and rollback. Do not treat simulator compilation or Expo JS export as device validation.
6. **Explicit release decision:** only after evidence, privacy and migration review, and signed-device acceptance. Do not auto-merge draft PR #12.

## Deliberately out of Milestone 1

[Cloud guardrails PR #20](https://github.com/ashlynsloane/side-quest/pull/20) remains **draft/feature OFF**, requiring independent Supabase staging and authenticated two-device validation. The separate generalized rehab and UX branches are not implicitly incorporated by a passing core acceptance.

## Operational checks

- Planner and source QA: `.github/workflows/automated-athlete-acceptance.yml` on the **exact candidate SHA**.
- Full native Release binary + six-stage Maestro: `.github/workflows/native-ios-simulator-smoke.yml`.
- Reuse previously compiled binary only with exact source SHA-256 match: `.github/workflows/native-ios-ui-only.yml` with scope `full`, `isolation`, or `strength`. Only scope `full` constitutes the integrated native gate.
- Review six individual `maestro-evidence/{stage}-junit.xml` reports and `native-ui-summary.json`; absence/skips are FAIL/NOT_REQUIRED, never PASS.
- No real-athlete data in committed fixtures, log artifacts or screenshots.

**Rule:** update this snapshot only after reading the actual run status and evidence. Do not infer native outcomes from source/tests alone.
