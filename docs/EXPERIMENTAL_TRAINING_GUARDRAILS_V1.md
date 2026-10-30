# Side Quest — Experimental Training Progression Guardrails v1

**Status: Domain evaluation module / draft branch only.** This is not a deployed feature, a pTSS formula, a personalized injury-risk threshold, or a recommendation to train or return to sport.

Source policy: athlete-provided `Side_Quest_Training_Guardrails_Handoff(1).md`, dated 2026-10-30. Numerical defaults are **athlete-selected experimental restraints**, not statistically learned from retrospective training records.

## Precisely retained defaults

| Metric | Maximum upper planning ceiling |
| --- | --- |
| Running | prior approved complete 7-day running distance times 1.10 |
| Cycling | prior approved complete 7-day cycling minutes plus smaller of 10% or 60 minutes |
| Combined | prior approved complete 7-day training minutes plus smaller of 10% or 60 minutes |
| Long-day spacing | review two adjacent local calendar days each having at least 120 combined training minutes |

Run, bike, swim, strength, rehabilitation training sessions and other **intentionally tracked training** all consume minutes in the combined budget. The same run/bike activity must simultaneously satisfy its specific budget, but minutes are counted only once in the combined budget.

No new intensity, hill, swim, strength progression, hormone, or life-stress coefficient has been invented. Intensity/hills/new modalities/symptom-related substitutions are review flags, not hidden numerical penalties.

**A pass means within athlete-selected arithmetic limits only. It does NOT mean safe, fit, medically cleared, or a recommendation to increase volume.**

## What exists in the code

Pure, testable module:
- `packages/planner/src/experimental-training-guardrails.ts`
- `packages/planner/test/experimental-training-guardrails.test.ts`
- exported from `@circuit/planner`

Supported behaviors:
1. Freeze a ceiling from a user-reviewed **eligible completed previous Monday-Sunday week**. Preserve baseline identity, date, timezone, completed volume, provenance, policy version and freeze timestamp. Zero/unknown baseline dimensions do not authorize restarting those disciplines.
2. Return `baseline_required` or `return_plan_required` when the baseline is absent, unapproved, interrupted or a return/rebuild is indicated.
3. Evaluate the entire requested local Monday-Sunday calendar week **and** every affected rolling seven-day window ending during that week or within the following six dates. Future weeks without frozen ceilings remain provisional.
4. Combine planned remaining and completed exposure; completed activity replaces its explicitly linked plan. TP/Garmin copies must share an explicitly reconciled canonical activity ID. Conflicting or uncertain overlaps prevent confirmed policy compliance.
5. Require explicit coverage of all affected local dates. Unknown duration, unknown running distance, incomplete coverage, ambiguous source records or lack of next-week ceiling cannot yield a green result.
6. Flag 120+ minute adjacent days across Sunday/Monday; independently flag intensity, hills, new modality and symptom-driven substitutions without diagnosing injury.
7. Require explicit clinical constraint state (active/unknown/none reported); active/uncertain constraints supersede arithmetic compliance.
8. Never automatically raise a frozen allowance midweek, replace real completed exposure with a ceiling, bank unused volume or auto-recommend training to fill the allowance.

## Critical source-data integration work **not yet done**

An `EnduranceActivity` in the current app contains a provider identity, completed start time, seconds, distance meters, source discipline and metadata. A `TrainingCalendarEvent` represents calendar intent, generally not proof of completion; some events are all-day or have no known duration. Strength history and generator plans are stored separately. Current `whole-athlete-plan.ts` constructs discipline baselines using recent activity lists and capacity approximations, *not* an athlete-approved seven-day exposure baseline.

Therefore **do not silently wire policy evaluation to the existing generated-week button yet**. A numeric green status today could be unsupported because:
- TrainingPeaks calendars contain **planned** sessions as well as possible historical workouts; planned intent is not completed load.
- Garmin/Strava or a linked strength workout can describe the same session. Canonical identity must be reconciled before summing.
- Some calendar events have an unknown exact duration, and a known run distance need not imply known minutes.
- No approved and frozen completed baseline has been captured.
- Recovered training after injury/illness must not be initialized from a zero week, historic peak or athlete availability.
- The actual athlete's current health/training interruption is not ordinary progression.
- Strength, rehab and unusual activities need explicit inclusion semantics rather than device steps becoming training automatically.

### Proposed adapter / infrastructure sequence (core training first)

**A. Reconcile activity ledger:** Introduce a covered, versioned snapshot mapping planned and completed sources into one canonical record:
- provider-specific records -> activity identity and explicit match
- `planned` versus `completed`, stable linked plan ID
- local date using configured IANA timezone, sport, duration minutes, run kilometers
- measured/estimated/unknown, source coverage and unresolved conflicts
- preserve original records (never delete history to de-duplicate views)
- strength sessions and PT rehab exercise sessions counted only when intentionally tracked as training

**B. Baseline selection:** Add a user-review step for a candidate *completed previous week*, with data-coverage and symptom-context confirmation. Persist one approved baseline and one immutable frozen allowance per target planning week. A current interruption produces no allowance and needs a separate return workflow. Approval is for policy comparison, **not medical fitness**.

**C. Read-only plan check:** Combine completed elapsed days and pending planned sessions, run the evaluator, and explain:
- run distance / cycling minutes / total minutes versus frozen upper ceilings
- which constraint binds, which windows fail, provenance and missing data
- spacing and hill/intensity review alerts separate from the numeric check
- `within_policy`, `exceeds_policy`, `review_required`, `insufficient_data`, `baseline_required` or `return_plan_required`

**D. Planning loop:** When a session is added/moved/changed, re-evaluate weekly and rolling checks and ask for explicit review when necessary. **Do not auto-change or cancel athlete-selected sessions**, prescribe missing minutes, approve clinical restrictions or retroactively change a frozen ceiling.

**E. End-to-end training experience:** Athlete onboarding -> explicit training availability versus recent actual exposure -> first-week proposal -> source-aware calendar -> start/resume/record -> reconcile completed exposure -> next week's eligibility and optional progression. The guardrails support this flow; they are not a sixth unrelated feature page.

### First nontrivial implementation gate

A user with an eligible approved previous week can see three ceilings, read the limiting constraint, edit the plan and understand the revised checks. A user with missing activity duration or injury interruption sees an honest incomplete/return message and **no recommendation to ramp from zero**.

Do not add rehab prescriptions to the core plan until this training path is usable and clinically relevant constraints can be correctly applied.

## Verification & limitations

- Domain regression tests cover the exact handoff arithmetic, simultaneous constraints, provider deduplication, zero/missing baselines, rolling windows crossing weeks, long-day review, symptom-driven substitutions, unapproved baseline, interrupted training, missing data, and clinical state.
- CI workflow: `.github/workflows/experimental-training-guardrails.yml` (planner typecheck + tests).
- This branch does not change active mobile UI, the iPhone SQLite database, rehabilitation code, pTSS experiments or workout prescriptions.
- Until CI and actual app-source reconciliation complete, code behavior should not be represented as verified on an iPhone.
- The current athlete has reported a training interruption related to symptoms; **this work does not authorize starting or increasing training**.
