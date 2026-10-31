# Native iOS scripted acceptance

This directory contains Maestro journeys for the **isolated synthetic iOS app**, bundle ID `com.sidequest.synthetic.qa`. The CI workflow rewrites `apps/mobile/app.json` only inside an ephemeral macOS runner. It never deploys to an installed beta, uses fictional accounts, and does not access real athlete records.

## Journeys

- `synthetic-onboarding-first-week.yaml`: fresh synthetic local account, fast-start questionnaire, saved first-week preview and Week screen.
- `synthetic-completed-ride.yaml`: onboard a fresh synthetic athlete, record a 75-minute bike activity with deliberately **unknown** distance, inspect actual activity review.
- `synthetic-ride-restart.yaml`: record the synthetic ride, terminate and relaunch the native app, then verify the record remains in history.

## Evidence chronology

1. **Native build and launch passed** in [run 41161358738](https://github.com/ashlynsloane/side-quest/actions/runs/41161358738): native Release build, simulator install, launch and initial screenshot.
2. **First interactive run failed** in [run 41163888023](https://github.com/ashlynsloane/side-quest/actions/runs/41163888023). Simulator screenshot and accessibility hierarchy confirmed the original test typed both the name and email in the **Name** field, leaving the Email field blank and the Enter beta button disabled. Both journeys failed at the same initial first-week assertion. This was a test-input targeting error, not evidence of an app crash.
3. Corrected the test with explicit Name/Email/Enter-beta accessibility IDs and a keyboard dismissal between fields. Added stable IDs for the onboarding and activity-save actions. A subsequent full native run must be completed before these interactions are called passing.
4. **Second corrected native run [41211274766](https://github.com/ashlynsloane/side-quest/actions/runs/41211274766) failed** on the isolated profile-entry stage. A fresh screenshot and accessibility hierarchy showed `Name` contained both the fictional name **and the fictional email**, while `Email` remained blank and Enter beta stayed disabled. Maestro's successful `tapOn` action did **not** guarantee focus changed, because the keyboard occluded the lower field.
5. The profile-entry flow now enters the lower Email field **before** opening the keyboard for Name, then taps the non-interactive form title instead of relying on `hideKeyboard`. The ride flow also avoids `hideKeyboard` for its numeric keypad. See [the latest full native workflow](https://github.com/ashlynsloane/side-quest/actions/workflows/native-ios-simulator-smoke.yml); none of these updated interactions count as passing until their own JUnit evidence confirms success.
6. The restart journey remains a separate acceptance gate. When a prerequisite fails, its status must be reported as **blocked / not executed**, not passed.

## New verified native evidence

- [Native staged run 41214934281](https://github.com/ashlynsloane/side-quest/actions/runs/41214934281): **synthetic-profile-entry PASSED** on a real iOS simulator. First-week onboarding FAILED at `scrollUntilVisible: element: "Continue"`, even though the screenshot visibly showed the green Continue button and the accessibility hierarchy identified `sidequest-qa-onboarding-next` as enabled. Completed ride and restart were **BLOCKED**.
- The onboarding flow now scrolls to and taps the stable accessibility ID `sidequest-qa-onboarding-next` with a 50% visibility threshold; it no longer relies on text matching of nested button content.
- [Full native build 41214934281](https://github.com/ashlynsloane/side-quest/actions/runs/41214934281) published an isolated `sidequest-synthetic-ios-app` artifact with source fingerprint. [UI-only run 41227346948](https://github.com/ashlynsloane/side-quest/actions/runs/41227346948) successfully resolved the source-compatible binary, booted an iPhone simulator and installed the app without Xcode recompilation; interactive outcome must be verified separately.
- Native compilation now triggers only when app source/config/dependencies change. UI YAML or runner script edits use the source-matched UI-only workflow. A source-hash mismatch **must** fail, not use a stale binary.
- Regression results: [615/615 tests](https://github.com/ashlynsloane/side-quest/actions/runs/41215203188) passed before the latest selectors; subsequent changes require their own CI result.

## Required evidence to call the native release gate passing

- All three Maestro scenarios execute successfully against a native iPhone simulator with non-empty JUnit reports.
- Screenshots and the accessibility hierarchy match the expected states, and no error/blank screen is mistaken for successful navigation.
- A completed ride appears in training history **after cold relaunch**, with actual 75-minute duration and absent/unknown distance rather than an invented mileage.
- Athlete profile isolation and pending-partial-workout force-quit recovery still require additional native scenarios beyond the first three.
- Do not infer clinical safety, data-source coverage, or actual hardware correctness from simulator success.

Run through `.github/workflows/native-ios-simulator-smoke.yml`. Inspect GitHub Actions artifacts, including the `maestro-evidence/` directory, for any failure. The planner/SQLite suite is a separate gate; both must pass before promoting PR #12.

Maestro CLI documentation: https://docs.maestro.dev/maestro-cli
