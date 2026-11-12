# Training Adjustment Release Gate — Automated SQLite and iPhone QA

**Status (2026-10-30):** engineering acceptance protocol, NOT proof of a physical-device test. No personal health or training data should be placed in public repositories or included in screen recordings.

## Scope and design principle

This gate validates the existing training-first workflow from draft PR #9: baseline review → read-only proposed-week comparison → explicit acceptance of a generated-endurance change → effective Plan calendar → app restart → restoration/undo. It does not evaluate clinical effectiveness, risk of injury, fitted pTSS, rehab treatments or ability to prescribe a return to sport.

These athlete-selected ceilings remain upper planning constraints, never a target or medical authorization.

## Already automated on GitHub Actions

The `packages/planner/test/training-adjustment-sqlite.test.ts` suite uses the built-in **real-file SQLite engine** on Node 22, not a mocked array of records. The mobile database delegates to the same shared query/transaction/validation layer in `packages/planner/src/training-adjustment-sqlite.ts`.

Each check has deterministic fabricated source/calendar identifiers and synthetic training doses only. No user records are used.

| Case | Required assertion |
| --- | --- |
| First acceptance | Original generated event is unchanged; effective view reflects accepted reduction |
| Close and reopen SQLite | Accepted adjustment survives process-style DB reopen |
| Restore and reopen again | Raw session restored; original acceptance and restoration events both retained |
| Defer | Raw event remains stored and effective view removes only the accepted deferred session |
| Decline | No effective-plan edit; decline recorded in event log |
| Two athlete profiles | Separate DB files expose separate accepted event logs and effective calendar views |
| Closed-file backup/restore | Restored SQLite copy includes raw event and accepted adjustment |
| Re-generated different session | Old signature fails closed, raw replacement shown, stale accepted decision retained |
| Removed source event | Historical accepted decision still discoverable by its original week |
| External calendar event | Never accepts or applies a Side Quest-only plan adjustment |
| Invalid duration | Cannot store an arbitrary increased or incorrect proposed dose |
| Concurrent/repeated decision | Transaction rejects duplicate accepted decision; earlier audit unchanged |
| Corrupt JSON | Incomplete/corrupted decision history throws instead of silently pretending there are no approvals |
| Scoped queries | Separate planning weeks do not mix adjustment decisions |

The CI workflow also executes planner regression tests, **mobile and planner TypeScript checks**, and an **Expo iOS JavaScript bundle export**. The latter validates the JS bundle and route imports, *not* signing, launch, native permissions or Apple device persistence.

## Physical iPhone / iOS simulator acceptance (NOT YET PERFORMED)

**Prerequisites:** dedicated development/test build, backed-up primary app, synthetic test athlete, separate app identifier if a new beta build could replace an installed app, and no real medical details in fixtures or logs. Never overwrite the existing athlete's working app/database to obtain a test result.

Use a deliberately fabricated athlete with an eligible completed previous week and a generated upcoming endurance plan whose known combined minutes exceed the experimental cap. Its session should have a reproducible source ID and confirmed 20+ minute duration. Do not fudge the on-device clock or introduce real injury history into the test profile.

Test in order, recording each outcome as PASS / FAIL / BLOCKED / NOT RUN:

1. **Onboarding/reuse:** test athlete completes ordinary training onboarding once, gets a real generated first week, and reopening the app does not force a second questionnaire.
2. **Source audit:** confirm planned vs completed distinction, unknown run mileage/duration stays unknown, duplicate imports show review-required rather than green.
3. **Baseline:** athlete can only approve a *completed* immediately preceding local Mon–Sun week; active restrictions, uncertain provider capture and retroactive freeze are rejected.
4. **Preview:** original planned session and all three known subtotals are visible; proposed shortened/deferred outcome does not claim safety or silently invent reduced run distance.
5. **Accept:** select one generated bike session and accept shortened dose. Calendar, plan details and evidence review agree with effective duration; external TrainingPeaks item and strength workout remain unchanged.
6. **Force quit/reopen:** iOS app termination and reopening preserve the accepted adjustment and original session source; no questionnaire repetition.
7. **Refresh generator:** refresh the same deterministic plan; if source signature is unchanged, applied view persists. If the source changes, show explicit stale-decision warning and original new plan without incorrectly restoring the obsolete dose.
8. **Decline:** decline another proposal; no calendar mutation occurs, but audit has a decision entry.
9. **Restore:** with no new restriction or completion, explicitly restore the original source; after force quit/reopen it is still restored; both past acceptance and restoration remain in history.
10. **Complete after approval:** link a completed workout to the original plan and confirm the app cannot keep treating the planned item as independently outstanding or re-edit the completed workout.
11. **Clinical state changes:** introduce synthetic active restriction and confirm accept/restore are denied, without an automatic return prescription.
12. **Profile switch:** create synthetic athlete B, confirm no decisions/health data from athlete A appear; return to athlete A and confirm independent decisions persist.
13. **Offline:** repeat plan read, acceptance and restoration in airplane mode; no hidden online dependency for local SQLite operations.
14. **Backup and restore:** fully close the app and restore a TEST profile backup; verify linked source events, decisions, and state remain consistent.
15. **Accessibility and recovery:** VoiceOver labels and button states, font scaling, short/long screens, graceful error messages for invalidated source signatures, and ability to exit/re-enter review without state corruption.

If a previous-week baseline cannot legitimately be approved due to the test date or missing source coverage, mark the on-device scenario **BLOCKED**. Do not check confirmation boxes dishonestly to force the review path to appear.

## Data-integrity failure boundaries

- An app-generated endurance calendar is not an external completed-workout database.
- Device storage and user login/profile are distinct isolation boundaries; tests need both.
- A SQLite-copy test is not a full app backup/restore test with related databases, migrations and native filesystem.
- A successful `expo export --platform ios` is not a signed iOS build or a physical-device test.
- Same ID with changed content means stale decision, not safe carryover.
- Rejected/corrupt operations cannot partially update stored plans or erase previous accepted events.
- Never publish personal activity data, screenshots of medical records, provider tokens, device IDs or profile databases.

## Definition of done before release

Automated CI green at exact source commit, on-device acceptance steps 1–15 recorded, profile and restart tests observed, no unresolved source-data safety or recovery failures, PR reviewed, backup/reinstall strategy documented. **Do not merge or label production-ready solely on the basis of this file.**

## Reviewer evidence template

Record for each test: date, device model and iOS version, test-app build/commit, synthetic profile identifier, test case, expected behavior, actual behavior, pass/fail/blocked, reproduction notes and sanitized screenshots. Avoid usernames, location traces, biometric/health records, Garmin/TrainingPeaks tokens and actual GPS routes.
