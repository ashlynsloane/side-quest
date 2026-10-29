# Side Quest — User Journeys and Acceptance Criteria

**Companion to:** `SIDE_QUEST_PRODUCT_BLUEPRINT_V1.md`  
**Status:** Functional design; no implication that these flows are already implemented.  
**Goal:** Specify the journeys *before* screens. A flow is accepted only when its entry, action, interpretation, and persistence work end to end.

---

## Journey 1 — Normal training day (no active injury restriction)

**User story:** "Tell me what to do today, why it fits my plan, and let me log what actually happens."

**Mobile journey:** Open Today -> see one primary next action and planned dose -> inspect rationale and confidence -> begin workout -> perform or adjust exercises -> log actual completion -> optionally note response. Resuming after a crash/app switch returns to the same session.

**Desktop journey:** See the completed session in training history and planned-versus-actual calendar. Inspect source, changed exercises, skipped sets, loads, and recorded rationale.

**Rules:** No duplicate exercise session when one workout is reopened. Calendar intent is not completed training. Progression does not depend on a nonexistent pTSS model.

**Acceptance:**
- [ ] From cold launch, the next action is visible without opening a secondary screen.
- [ ] The user can start/resume an approved session, change a prescribed movement safely, and preserve an audit trail.
- [ ] Actual sets, repetitions, loads, time and modifications remain after force-quit/relaunch.
- [ ] Desktop/history view distinguishes performed from planned.
- [ ] Missing external workout sync does not prevent basic training logging.

## Journey 2 — Unexpected new injury (crash, fall or sudden onset)

**User story:** "Something just happened. I want to record it and understand what to do next without being given an unqualified diagnosis."

**Mobile journey:** Today or Rehab -> "Report new issue" -> mechanism + laterality/body area + **actual onset date/time or unknown** -> short impact/function/safety questions -> immediate appropriate escalation if concerning -> create unassessed case -> make affected plans **review-needed**, not implicitly safe -> capture follow-up.

**Desktop journey:** Open full case, review event time against training history, add clinician assessment, additional context and restrictions with source; see pending work requiring medical clarification.

**Rules:** Traumatic and gradual load-associated pathways remain distinct. No automatic protocol for unassessed pain. Distinguish `occurred_at`, `recorded_at` and unknown precision; do not assume a crash is an overtraining event.

**Acceptance:**
- [ ] Historical onset can be entered; approximate/unknown is an explicit option.
- [ ] Invalid/future date rejected where inappropriate; same-day event supported.
- [ ] New red flags produce an appropriate clinical escalation, never exercise clearance.
- [ ] Current training is reviewed against active case(s); existing completed history unchanged.
- [ ] Case survives restart and can be corrected through an auditable revision.
- [ ] A user can create a new case even with no connected devices, and can report an injury in a previously unspecified region.

## Journey 3 — Persistent condition with intermittent flares

**User story:** "My condition doesn't disappear just because I felt better last week."

**Mobile:** Rehab -> existing case -> record flare, aggravating activities, symptom/function response -> inspect clinician-approved allowed exposures -> log rehab and subsequent response -> continue permissible unaffected training.

**Desktop:** Compare flare episodes while retaining the parent case; place symptom series, rehabilitation dose and general training on a shared timeline; inspect confounding factors and missing observations.

**Rules:** A flare is not a new diagnosis; a chronic case need not be "fully healed" to have a stable, effective management plan. No automatic return to unrestricted loading from a few pain-free entries.

**Acceptance:**
- [ ] Multiple flares attach to one persistent case without overwriting earlier episodes.
- [ ] A new unrelated injury can coexist without changing the parent case's diagnosis.
- [ ] Different tasks (rest, walking, rotation, overhead reach) remain distinct metrics.
- [ ] Restrictions are combined conservatively; unaffected activity may remain permitted when clinically appropriate.
- [ ] No pressure to report zero symptoms as the only measure of progress.
- [ ] PT can review longitudinal functional milestones and flare triggers as associations, not established causes.

## Journey 4 — An actual physical therapy home program

**User story:** "My PT prescribed six exercises. Help me perform them faithfully between appointments."

**Desktop first (configuration):** Enter or import clinician-provided plan -> map each exercise to a unique reviewed Side Quest movement -> capture sets/reps/load/tempo/allowed discomfort/weekly schedule/clinical stop rules -> record author and approval date -> review and activate. Ambiguous movement names require confirmation; copyrighted media remain external unless licensed.

**Mobile (execution):** Today/Rehab -> "Your PT program" -> prescribed dose and technique -> complete/skip/alter only within allowed options -> record in-session symptoms -> ask delayed-response questions later -> show approved progression or prompt to review.

**Desktop (review):** Compare prescribed versus performed and contextual function measures, and prepare an accurate PT update.

**Acceptance:**
- [ ] A clinician plan can be saved without inventing the missing diagnosis, movement, or dose.
- [ ] Every exercise has a verified unambiguous ID; unresolved catalog collisions block mapping.
- [ ] User sees clinician instructions verbatim/faithfully attributed and original source.
- [ ] No algorithm silently increases load outside documented approved range.
- [ ] Exercise adherence reflects scheduled exposure and actual completion; no "missed" label when data aren't available.
- [ ] Incomplete and abnormal responses prompt appropriate review rather than silent progression.
- [ ] Multiple simultaneous programs with overlapping restrictions are resolved explicitly.

## Journey 5 — A meaningful PT follow-up report

**User story:** "My therapist should understand the previous two weeks without me reconstructing them."

**Desktop:** Select one/multiple cases + date range -> choose symptom/function measures and relevant activities -> inspect source quality/missingness -> view dated charts, intervention annotations, adherence, restriction/diagnosis changes -> redact sensitive context -> export PDF with optional structured CSV/JSON, only after explicit consent.

**Mobile:** See short visit summary and optionally share it through an explicit native action; no automatic clinician account access.

**Acceptance:**
- [ ] Report includes precise case, date range, time zone and measurement definitions.
- [ ] Dated axes and observations: no undated bar implying recovery.
- [ ] Correctly distinguishes athlete reports, device measures and clinician-origin instructions.
- [ ] TrainingPeaks/Garmin duplicates are reconciled or explicitly flagged; never silently doubled.
- [ ] Missingness and coverage included; no causal claims from time overlays alone.
- [ ] The report can be recreated exactly from the saved snapshot, source references and transformation version.
- [ ] User can preview, exclude unrelated medical information and cancel without sending.
- [ ] Export persists or recovers safely if offline; no accidental automatic upload.

## Journey 6 — Investigating a historical training/health pattern

**User story:** "What did my training actually look like before several different setbacks?"

**Desktop only, exploratory:** Choose date span and injury case -> load sport-specific external exposure and device signal quality -> inspect unrecorded periods and reported reasons -> compare episodes and surrounding training -> optionally save a reproducible descriptive view.

**Mobile:** One relevant summary, not a multivariate modeling console.

**Rules:** This is descriptive analytics. A relationship between a load increase and a subsequent injury is not causal proof or a validated personal threshold. Research-level personal pTSS analyses continue separately until scientifically evaluated.

**Acceptance:**
- [ ] User distinguishes measured TSS from estimated load, and understands the estimator and its confidence.
- [ ] Training volume, intensity and paces/power use consistent units and sport definitions.
- [ ] Planned events not counted as completed; overlapping sources de-duplicated or visibly unresolved.
- [ ] Entire absent intervals are not automatically assumed to be rest or healthy periods.
- [ ] Injury onset precision, clinical diagnosis source and different injury types are visible.
- [ ] At least two sensible alternatives/negative controls can be considered before any load-pattern conclusion.
- [ ] No pTSS result, threshold, or "minimum effective dose" number is fabricated or shown without actual validated analysis.

## Journey 7 — Correction of a historical record

**User story:** "I entered my injury date incorrectly; I need to fix it without losing later observations."

**Desktop:** Select record -> "Correct factual detail" -> enter new value, reason and certainty -> confirm revision -> retain old version, time of correction, and updated reports. On mobile allow correcting basic fields with a visible history link.

**Acceptance:**
- [ ] Onset time can be corrected independently of the original creation timestamp.
- [ ] Existing check-ins, flares, restrictions, clinical notes and linked workouts remain attached.
- [ ] Prior versions are auditable; exports clearly use a specific corrected version.
- [ ] If correction changes clinical eligibility, relevant decisions are invalidated and sent for reassessment.
- [ ] Undo/revert is possible without editing the SQLite database by hand.
- [ ] No duplicate onset event is manufactured by editing a case.

## Journey 8 — Source import and cross-device reconciliation

**User story:** "I want a trustworthy timeline, not five conflicting descriptions of one workout."

**Desktop:** Import/authorize a source -> examine source type, coverage, mapped units and potential overlaps -> reconcile planned workouts versus performed workouts and multiple copies of the same activity -> approve/flag ambiguous relationships -> save import audit.

**Phone:** Connection health, sync status, an easily understood warning when stale or incomplete; daily logging stays available offline.

**Acceptance:**
- [ ] Original data preserved with source and source-specific identifier.
- [ ] Multiple imported views of the same session are not double counted.
- [ ] Calendar-only activities are classified as planned intent until completion evidence appears.
- [ ] No silent import of raw medical files to a cloud server.
- [ ] Failed import leaves canonical data untouched and is retryable.
- [ ] Export/restore preserves profile isolation; no user data leaks across identities.
- [ ] Unreconciled records remain visible for review with coverage and uncertainty.

---

## Cross-journey discovery tests

Have a tester unfamiliar with the app find these tasks without instruction:

1. Start today's workout.
2. Record a new injury.
3. Record a flare of an existing injury.
4. Find and perform the PT-approved home exercises.
5. Find the oldest observation for a condition.
6. Explain why today's planned workout was held.
7. Review the last month of training and symptoms.
8. Prepare a PT export and exclude unrelated notes.
9. Correct an incorrect historical injury onset.
10. Understand whether today's activity came from Garmin, TrainingPeaks, Side Quest, or manual entry.

**Design target:** No task should require knowing internal names like "Recovery guardrails", "Daily readiness", "Whole-athlete plan", or "injury episode" to discover the right destination. The internal clinical terms may appear in details for users who want them.

## Common failure states to design before implementation

- No data, stale synced data, offline, expired credentials.
- New symptom reported during a workout, not before it.
- Pain that differs dramatically by activity or body position.
- Multiple injuries with conflicting exercise permissions.
- Historical event with unknown onset date.
- Misclassified diagnosis revised by a clinician.
- PT exercise without a catalog match.
- Device change or lost phone with local-only records.
- User enters a new injury while onboarding with a previously generated high-load plan.
- Manual correction to an injury case with downstream reports already generated.
- Report is missing a day; absence is not improvement.
- One device reports an identical workout using a different measurement method.

A design is ready for UI implementation when its paths for ordinary, missing, uncertain and safety-critical states are explicit.

---

## Prototype and usability scoring rubric

For every task scenario measure:

- **Task success:** completed accurately without guidance.
- **First click accuracy:** expected starting destination versus actual.
- **Navigation burden:** number of meaningful actions and reversals.
- **Comprehension:** user can state what happened and why.
- **Trust calibration:** user distinguishes observed data, estimate, clinical instruction and suggestion.
- **Error recovery:** inaccurate details corrected without record loss.
- **Accessibility:** VoiceOver and keyboard/screen reader route where appropriate.

Suggested **prototype release criteria** (targets, not measured results): no safety-critical misunderstanding; all core tasks discoverable in an unaided small usability test; all high-severity task failures addressed before engineering, not after App Store/TestFlight delivery.

**No screen is considered "finished" until its whole user journey succeeds.**
