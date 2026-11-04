# Native iOS scripted acceptance

This directory contains Maestro journeys for the **isolated synthetic iOS app**, bundle ID `com.sidequest.synthetic.qa`. The CI workflow rewrites `apps/mobile/app.json` only inside an ephemeral macOS runner. It never deploys to an installed beta, uses fictional accounts, and does not access real athlete records.

## Journeys

- `synthetic-onboarding-first-week.yaml`: fresh synthetic local account, fast-start questionnaire, saved first-week preview and Week screen.
- `synthetic-completed-ride.yaml`: onboard a fresh synthetic athlete, record a 75-minute bike activity with deliberately **unknown** distance, inspect actual activity review.
- `synthetic-ride-restart.yaml`: record the synthetic ride, terminate and relaunch the native app, then verify the record remains in history.

## November 3 acceptance checkpoint

- [Full simulator run 41500092739](https://github.com/ashlynsloane/side-quest/actions/runs/41500092739) verified **profile PASS and entire first-week onboarding PASS**, including generated first-week preview.
- The completed-ride scenario reached `Completed bike` in Activity Review. Its archived screenshot and accessibility hierarchy both confirmed the actual saved dose displayed as `75 minutes · Intensity unavailable`. The exact-text assertion `75 minutes` failed because Maestro matched the entire accessibility label. That is **not** evidence of lost activity data; cold restart was **BLOCKED**.
- Native assertions now match composite labels using `75 minutes.*` and `75 min.*`, rather than weakening the record or assuming an unknown distance was zero.
- The shared runner now stages profile → onboarding → ride → restart with one synthetic athlete, avoiding repeated app resets. Independent Maestro invocations require an explicit `launchApp` and a retryable onboarding tap because the first foreground tap could otherwise be consumed without advancing. This revised staged handoff is still undergoing native verification.
- Source-matched reusable-binary jobs deliberately refuse a stale archive after app-source edits. Changes to the first-week save/recovery code require a new native Release artifact before these newer journeys can be verified.
- [Automated QA 41739781463](https://github.com/ashlynsloane/side-quest/actions/runs/41739781463) passed **643 tests in 109 files**. That verifies code-level behavior and disk-backed SQLite recovery, **not** cold-restart acceptance.
- The initial plan now uses a restart-stable opaque attempt identity and recovers a matching persisted block, repairing weekly rows after partial saves (issue [#18](https://github.com/ashlynsloane/side-quest/issues/18)). Cross-account async write fencing remains a separate open release risk ([#19](https://github.com/ashlynsloane/side-quest/issues/19)).

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

## November 2 — verified final-button selector regression

[Full native iOS run 41262127886](https://github.com/ashlynsloane/side-quest/actions/runs/41262127886) **passed synthetic profile entry and progressed through Step 7** but failed at Maestro `tapOn: {text: "Build my first week"}`. The actual saved iOS accessibility hierarchy exposes the pressable as `accessibilityText: "Build my first week, ›"`, with `resource-id: sidequest-qa-onboarding-next` and `enabled: true`. Therefore this particular failure was the **test failing to find the pressable**, not proof that the app's route change failed.

Restored the stable `id: sidequest-qa-onboarding-next` target, recorded a pre-tap screenshot, retained `retryTapIfNoChange: true`, and separated a 15-second navigation check from the later 120-second generation assertion. Run [41485434344](https://github.com/ashlynsloane/side-quest/actions/runs/41485434344) is the native UI-only verification attempt for this exact selector change. Do **not** count plan creation or ride persistence as native-verified until JUnit and screenshots confirm each stage.

## November 2 — XCTest driver cold-start incident

[Native UI-only run 41485434344](https://github.com/ashlynsloane/side-quest/actions/runs/41485434344) installed and launched the source-matched synthetic app but **never executed the profile scenario**. Maestro printed `iOS driver not ready in time` and produced no JUnit XML. The archived `xctest_runner` log shows the iOS UI test runner eventually started its local HTTP server after a long cold start. This is an infrastructure startup timeout, **not evidence that the profile or final-button code failed**.

The shared runner now exports `MAESTRO_DRIVER_STARTUP_TIMEOUT=360000` (milliseconds, six minutes), and the native workflow allows enough time for four sequential test-driver sessions. The diagnostic report explicitly marks no-JUnit driver startup as `DRIVER_STARTUP_TIMEOUT` instead of app failure. The native release gate remains red until a full run passes profile → onboarding → completed ride → relaunch.

## Required evidence to call the native release gate passing

- All three Maestro scenarios execute successfully against a native iPhone simulator with non-empty JUnit reports.
- Screenshots and the accessibility hierarchy match the expected states, and no error/blank screen is mistaken for successful navigation.
- A completed ride appears in training history **after cold relaunch**, with actual 75-minute duration and absent/unknown distance rather than an invented mileage.
- Athlete profile isolation and pending-partial-workout force-quit recovery still require additional native scenarios beyond the first three.
- Do not infer clinical safety, data-source coverage, or actual hardware correctness from simulator success.

Run through `.github/workflows/native-ios-simulator-smoke.yml`. Inspect GitHub Actions artifacts, including the `maestro-evidence/` directory, for any failure. The planner/SQLite suite is a separate gate; both must pass before promoting PR #12.

Maestro CLI documentation: https://docs.maestro.dev/maestro-cli
