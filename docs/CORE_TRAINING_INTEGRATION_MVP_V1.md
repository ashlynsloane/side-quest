# Side Quest Core Training Integration MVP — Training First

**Scope:** An integrated, synthetic-testable new-athlete path through existing mobile onboarding, generated first week, planned strength start, local workout ledger, calendar status, and weekly history. This branch is based on draft PR #10 and includes all prior training-draft changes by ancestry. It does **not** merge them into `sq2-experience-rebuild` or overwrite the user's installed iPhone beta.

## Engineering changes

### 1. New athlete sees a real seven-day multisport first-week proposal

Previously `onboarding-first-week.tsx` saved the initial strength block and displayed **only strength sessions**; endurance generation occurred only after opening the Plan tab (which triggered `refreshLatestWholeAthletePlan`). Now:

1. Onboarding creates the goal and planned strength block as before.
2. After storing the block, it generates and stores the full coordinated endurance proposal immediately.
3. A pure `buildFirstWeekTrainingSummary` composes seven local Mon–Sun dates, strength sessions and Side Quest-generated swim/bike/run events, marking planned duration as a proposal or unknown.
4. The onboarding preview displays all seven days, including no-session days and each planned sport.
5. If endurance planning fails, the already-saved strength block is displayed with an explicit error; the app does not claim a complete endurance week.
6. A returning athlete opens Week/Today without needing to repeat onboarding, subject to the existing stored onboarding state.

The first week is **provisional**. Availability and sport background do not prove historical tolerance or support increasing any discipline.

### 2. Eliminate fabricated legacy training history

The former whole-athlete refresh path treated a goal without a capacity profile as having **eight available hours and five hours of current endurance training**, and assumed ordinary running status. `resolveFirstWeekCapacity` removes this false baseline, preserving the existing profile's reported/observed provenance when available; older profiles without data receive no invented endurance history and cannot be considered return-to-running eligible based on missing information.

Note: New-athlete fast-start still uses athlete availability as a **provisional scheduling allocation**. It is explicitly labeled unverified and is not an approved completed-training baseline. Actual training import and a fully observed prior week remain distinct review tasks.

### 3. Planned workout identity survives Today / Week / Train

Previously the Today and Train buttons opened `setPreviewWorkout(next.workout)`, stripping the planned-session link. The Week screen used `openPlannedWorkoutPreview(session)` correctly. All three now use the planned-session path. The active workout receives its session ID so `saveCompletedWorkout(... plannedSessionId ...)` can mark the exact calendar item completed.

### 4. Workout completion is not allowed to fail invisibly

- The completion screen shows local-save state: saving, saved, or needs retry.
- It no longer claims calendar completion before the local persistence promise succeeds.
- A failed save leaves the live workout checkpoint available and offers retry.
- The original partial/full completion fraction and timestamp are retained across retries, preventing a partial workout from being silently transformed into full completion.
- Existing completed-workout idempotency now repairs derived training memory and planned-session status after a previous attempt committed the workout but failed during its post-commit updates.

The main workout ledger remains authoritative; optional cloud social publishing cannot revoke a successful local completion.

### 5. Manual completed endurance logging

The Train and Week screens now offer an explicit native path to record a **completed** run, ride or swim when no connected data are available. The form validates sport, athlete-local date, actual duration, optional distance and reported intensity. It persists to the same canonical `endurance_activities` table used by the source auditor. Unknown distance stays **unknown**, never inferred from pace or duration, and future-dated completed activities are rejected.

After saving, the athlete is routed to the existing activity-review screen to explicitly match the record with a planned event if appropriate. It does not treat a plan as proof of completion, automatically change next week's limits, or prescribe a new session.

### 6. Athlete-local dates and profile scope

- Shared `first-week-dates` helpers avoid shifting planned sessions across weekdays due to `toISOString()` conversion, including DST/year boundaries.
- The Week list renders local calendar days rather than UTC date portions of local timestamps.
- The onboarding questionnaire draft key is scoped to the current athlete profile, preventing a newly switched-in athlete from inheriting another athlete's draft answers.

## Automated verification

Dedicated planner tests:
- `core-first-week-journey.test.ts`: seven-day combined training preview, synthetic swim/bike/run/strength sessions, missing durations, source exclusion, legacy and current capacity provenance, date boundaries.
- `core-training-mobile-integration.test.ts`: verifies actual mobile route handoffs, manual endurance logging and completion-status integrity wiring; this is a **source-wiring regression test**, not a substitute for native interaction testing.
- `manual-endurance.test.ts`: validates actual completed endurance data, unknown running distance, date/duration bounds, future-completion rejection and stable record IDs.

Existing comprehensive planner tests and real-SQLite plan-decision tests remain in the suite. CI adds mobile/planner typecheck, planner tests, and Expo iOS JavaScript bundle export.

## Final release gates — not yet represented as passing

- On-device first-run from a clean synthetic account, then force-quit/reopen without setup repetition.
- Inspect that a triathlon first-week preview contains the expected generated endurance and strength sessions, while a strength-only goal does not generate irrelevant endurance.
- Start the same planned strength session from Today, Week and Train, complete and log it, then verify one ledger entry and the correct plan status after restart.
- Inject a **synthetic** local write failure and confirm the UI does not claim success; retry must repair a persisted-but-unmarked planned session.
- Verify isolated athlete profiles and private questionnaire drafts.
- Verify local weekend/DST and future-week boundaries in the actual iOS UI.
- Back up the current installed beta before any upgrade, test with a separate app ID/simulator, and inspect the existing support for recovery of workout and decision SQLite data.
- Reconcile real Garmin/TrainingPeaks completed activity coverage, canonical matches and missing durations before certifying next-week progression ceilings.
- Validate VoiceOver, screen size, loading/error states, and system-level interruptions.
- Do not merge rehab or deploy fitted pTSS coefficients as part of this training-first milestone.

## Product definition of done

A new synthetic athlete completes onboarding once, sees a coherent full week, opens a planned workout from any entry point, completes it, sees exactly one canonical recorded workout and the correct completed calendar status after app restart, and reviews next week's data without fabricated training baselines or non-consensual changes.

**Current state:** The code supports this path but independent iPhone end-to-end observation remains necessary before claiming release readiness.
