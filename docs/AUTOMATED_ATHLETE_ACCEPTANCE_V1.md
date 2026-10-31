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

The passing gate on commit `8157b960` established the Node/planner and direct database lifecycle checks **before** the new pending-completion changes. Subsequent commits require their own green run.

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
