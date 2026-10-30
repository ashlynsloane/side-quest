# Core Training Journey — Evidence Integration v1

**Status:** Draft product/engineering slice, not a release or medically authorized training plan.

**Branch:** `feat/core-training-evidence-review-v1`, based on `feat/experimental-training-ramp-guardrails` (draft PR #5). Merge the base policy PR first; keep this PR stacked until reviewed.

## Scope

This increment uses the existing Side Quest iPhone **first-week generator**, **training plan**, **completed workout ledger**, **external endurance records**, **planned-to-completed match table**, and **training history**. It does not build another standalone app or duplicate the rehab beta.

### Delivered

1. **Read-only week evidence model:** `buildTrainingWeekEvidence` in `packages/planner/src/core-training-week-evidence.ts`. Returns separate completed exposure, unconfirmed planned exposure, observed/estimated duration totals, unresolved fields, possible duplicates, source conflicts, and coverage status. The model never approves a training baseline.
2. **Source adapter:** `apps/mobile/src/services/core-training-week-evidence.ts`. Uses existing persisted ledger, linked wearable recordings and calendar entries. Completed sessions replace explicitly linked planned sessions; an unlinked same-day sport overlap is flagged rather than guessed.
3. **Plan UI:** `apps/mobile/src/app/(tabs)/plan.tsx`. Displays *Actual versus planned* evidence in the ordinary planning flow, with direct routes to weekly review and full training history. Future weeks say **Upcoming training week**; unscheduled days no longer have green completion-like markers.
4. **Onboarding provenance:** `apps/mobile/src/app/onboarding-first-week.tsx`. Stops assigning fabricated 15/20/30-mile running histories based on selected sport background. Introduces optional evidence markers in `AthleteCapacityProfile` / `PerformanceGoal` and labels initial session structure **provisional**.
5. **Experimental guardrail integration groundwork:** Existing planning ceilings on the parent draft branch; updated to raise a review flag if an activity duration is only estimated.
6. **Regression testing:** planner unit tests for the week evidence model and existing guardrail scenarios; mobile and planner TS typecheck in CI.

### Interpretation

- A known **completed** run contributes its measured run distance and duration, when present.
- A planned calendar workout contributes to **planned** totals only; imported calendar intent does not become a completed session.
- A linked Side Quest strength workout and its watch recording are one workout in the history. Wall-clock or watch-derived strength duration is marked **estimated** and cannot silently establish a tolerance baseline.
- A planned workout replaced by an explicitly linked completed activity is counted once; same-day possible matches without a confirmed link remain a review issue.
- Unknown running distance, missing duration, possible duplicate and limited source coverage are **unknown**, not zero or a pass.
- The current mobile queries and source roster cannot prove completeness across TrainingPeaks/Garmin and historic offline workouts. All evidence from this adapter therefore has **unverified coverage**.
- Calendar events classified as generic `other` are not silently included as training; they may represent ordinary living or work commitments.
- Approved baseline is **not assessed** by this module. The 10%-and-60-minute planning ceilings are dormant until a separate eligibility and freeze workflow exists.

### First-week generator disclosure

Previously the fast-start app transformed “triathlon background” into an invented recent running-mileage value, and transformed weekly **availability** into a fictional “current endurance hours” number. The first problem is fixed by using a conservative legacy numeric placeholder with explicit `runMileageEvidence: unknown`. The second is now marked `enduranceHoursEvidence: unverified_planning_assumption`: the current strength allocation function still needs a numeric planning reservation until a more complete first-week training questionnaire/data model is developed. Neither value is an approved completed exposure baseline.

**This remains a provisional training draft, not a proven minimum effective dose or medical clearance.**

## Acceptance and QA

Tested by automated planner suite and TypeScript compiler:
- completed vs pending planned sessions
- explicitly linked workout replacement
- one count for confirmed duplicate provider view
- source mismatch and likely unlinked same-day duplicates
- unknown duration and run distance
- estimated strength time, marked incomplete
- first-run zero actual vs unknown source coverage
- local calendar dates across Denver UTC/DST boundaries
- mandatory Monday start / valid IANA timezone
- experimental running/cycling/combined and rolling-window tests

**Not yet qualified on iPhone:** Real-device rendering, on-device activity reconciliation, SQLite migration/restore, background sync, complete provider audit, and clinician exercise safety. No database migrations or destructive operations were introduced.

## Remaining tasks for core training milestone

1. **Complete reliable activity source import/audit:** distinguish TrainingPeaks planned roster vs actual sessions, Garmin watches and manually entered sessions; provide explicit canonical matches and source coverage evidence. Correct strength active-duration measurement.
2. **Capture recent actual training at onboarding:** a baseline questionnaire should allow athlete-reported exposure or an audited import, not infer fitness from time availability or sport experience. Keep returning athletes from repeating setup.
3. **Baseline eligibility and frozen weekly allowances:** present an actual previous-week candidate, confirm training source coverage, relevant interruptions and symptom context, require explicit policy approval (not clinical clearance), freeze and version the limit. No rebound permission from injury/illness.
4. **Unified weekly review:** display actual volume, planned remainder and all rolling checks, with separate hills/intensity/long-day warnings. Never automatically fill the permitted allowance.
5. **End-to-end on-device acceptance:** onboarding -> first week -> start/resume -> log completed work -> matched history -> weekly review -> optional next week, verified offline and across restart. No check-in or preflight should bypass a clinician restriction.

## Explicitly deferred

- Virtual PT diagnosis/treatment/protocol integration
- Real-data pTSS models and fitted injury thresholds
- Automatic return-to-running or cycling allowances during the athlete's current interruption
- Cross-device health sync and production desktop workspace
- Arbitrary extra intensity, hill, swim or strength ramp coefficients
