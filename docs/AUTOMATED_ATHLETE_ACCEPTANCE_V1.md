# Side Quest automated athlete acceptance — engineering handoff

**PR:** #12 (stacked on integration PR #11)  
**Release state:** draft; do not merge or deploy without native simulator/device QA.  
**Environment:** synthetic athletes only. No installed beta or personal data touched.

## Implemented automation

### Planner and proposed-week invariants
- Athlete capacity provenance: no invented observation when history is missing.
- Seven-day multisport proposals, generated-vs-external source isolation, unknown-dose handling and week boundaries.
- Manual completion invariants for actual duration, source and deliberately missing distance.
- 48 seeded proposed-week cases and 32 seeded manual-dose cases, with reproducible seed numbers.

### SQL persistence and workout lifecycle
- Real-file SQLite tests of append-only plan adjustments, acceptance, decline, restore, staleness, profile isolation and backup copies.
- Direct import of **the application's actual** `apps/mobile/src/services/database.ts`; only the native Expo SQLite transport is replaced with an isolated disk-backed Node SQLite driver.
- Planned workout completion → canonical ledger → linked calendar status.
- Idempotent retries, partial completion identity, transaction rollbacks, injected post-commit failure recovery, service restart and profile isolation.
- CI-only module aliases avoid evaluating native Expo/React Native code under Node. They are NOT bundled into the mobile app.

### Interrupted partial-completion journal
- Backward-compatible optional `pendingCompletion` metadata in the live session checkpoint.
- Save the original completion fraction and timestamp to local persistence before attempting canonical SQL commit.
- Reopen a pending completion into a dedicated retry state, not a normal work/rest state defaulting to 100%.
- Unit tests for checkpoint roundtrip, malformed fractions and removal after success, plus source-wiring assertions.
- **Risk tracking:** https://github.com/ashlynsloane/side-quest/issues/13

### Continuous integration and reports
Workflow: `.github/workflows/automated-athlete-acceptance.yml`.

It runs planner/mobile typechecks, the dedicated synthetic and real-mobile-SQL acceptance tests, the full planner regression suite, and Expo **iOS JavaScript export**. JUnit XML files plus `qa-summary.json` are uploaded on each run. The GitHub Actions run summary shows check counts.

The corrected planner/SQLite gate passed on commit `8f252366` ([GitHub Actions](https://github.com/ashlynsloane/side-quest/actions/runs/41161656734)). Later source changes must be verified on their own commits.

## Native iOS evidence — first real simulator milestone

- [GitHub Actions run 41161358738](https://github.com/ashlynsloane/side-quest/actions/runs/41161358738) **passed**: ephemeral bundle ID `com.sidequest.synthetic.qa`, Expo prebuild, CocoaPods, iPhone simulator boot, native Release build, install, application launch, and first-screen screenshot.
- Artifact `isolated-synthetic-ios-smoke` includes `synthetic-ios-first-launch.png`, the launch receipt and native build logs.
- Screenshot inspection showed the expected Side Quest brand/sign-in screen and local synthetic beta-profile form, not an OS crash screen.
- This passes a **launch smoke test**, not onboarding, training history, workout recovery, screenshots across devices, or source reconciliation.
- Next [native iOS automation run](https://github.com/ashlynsloane/side-quest/actions/runs/41163888023) adds actual Maestro onboarding and completed-ride interaction scripts. **Its results must be checked separately before calling those journeys verified.**
- A restart persistence flow is also stored at `e2e/maestro/synthetic-ride-restart.yaml`; it is not yet incorporated in the native workflow.
- Stable `testID` selectors have been added to key onboarding and activity controls for future scripted testing.

## What passing results DO NOT establish

- A signed iOS build, simulator launch, physical iPhone persistence, real force termination or actual Apple backup restore.
- Manual UI navigation, screen accessibility, layout accuracy or screenshots.
- Garmin/TrainingPeaks provider completeness, real workout matching or recovery from late imports.
- Clinical clearance, pTSS effectiveness, injury prevention, or safety of a proposed training dose.
- That the current installed beta contains these changes. It does not.

## Next release gates

1. macOS iOS simulator end-to-end seeded onboarding → planned workout → completion → force quit/reopen → next-week review.
2. Real Expo SQLite migrations and profile switching, plus native offline/error interruption.
3. Native screenshot / dynamic text / VoiceOver regression tests.
4. Provider provenance audit with synthetic data first; real user integrations only after separate authorization.
5. Resolve issue #13 on a native device; pass all required QA gates before making PR #12 ready for merge.

## Local commands

```bash
pnpm install --frozen-lockfile
pnpm --dir packages/planner typecheck
pnpm --dir apps/mobile typecheck
pnpm --dir packages/planner exec vitest run test/automated-athlete-acceptance.test.ts test/actual-mobile-workout-sqlite.test.ts test/pending-completion-restart.test.ts
pnpm --dir packages/planner test
pnpm --dir apps/mobile exec expo export --platform ios --output-dir /tmp/sq-acceptance-ios
```

## November 10 — local-first athlete-switch fencing (issue #19)

The first-week setup previously generated a plan asynchronously and called
`getTrainingBlockById`, `savePerformanceGoal`, `saveTrainingBlock`,
and `refreshLatestWholeAthletePlan` through the module-scoped active SQLite
handle. Switching athlete profiles while the asynchronous work was running
could silently direct A's work to B's database.

The QA branch now:

- Serializes `activateUserDatabase` against
  `withVerifiedAthleteDatabase(athleteId, work)`. A verified athlete's
  multi-step first-week writes use the same active SQLite handle until the
  last calendar refresh completes, or fail before writing when B is already
  active. Failed activation/write releases the queue.
- Protects the **evidence collection phase** as well: default equipment
  seeding is a write, and recent exercise/exposure reads can otherwise be
  sourced from the wrong athlete during generation. These are scoped before
  pure block generation begins.
- Checks the current athlete/attempt after generator awaits, before writes,
  and before setting finished UI state. Late A generation cannot update B's
  first-week screen. A user-facing retry intentionally reuses the durable
  first-week timestamp and seeded block identity instead of inventing a
  new plan on each attempt.
- Exercises disk-backed SQLite with paused generation (A then B), switching
  during goal/block/calendar writes, failed writes followed by B's successful
  activation, and default equipment isolation. These are real SQL assertions,
  not mocks of the application's database service.
- Adds stable React Navigation tab button test IDs for Today/Week/Train.
  The native ride and cold-restart Maestro flows use the `sidequest-qa-week-tab`
  ID rather than iOS-version-dependent accessible label strings.

**Limits:** this does not replace the native simulator gate for mid-generation
profile switching, and it does not provide global cancellation of every legacy
background task in Side Quest. The new lock is deliberately narrow to first-week
source reads and persistence; other unsynchronized mutation paths need separate
audits before production promotion.

Native automated acceptance still requires actual passing Maestro JUnit
evidence for profile → first week → completed ride → restart, plus a dedicated
mid-onboarding A→B switch scenario. Do not claim those results from static tests
or a green planner/SQLite workflow.
