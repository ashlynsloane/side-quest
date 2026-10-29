# Side Quest — Screen Blueprints and Interaction Contracts

**Version:** Draft v1.0  
**Purpose:** A low-fidelity layout and information contract to test *before* implementing mobile or desktop screens.  
**Status:** Proposed product behavior, not current app screenshots or working UI.

These sketches are intentionally grayscale/text-first. Visual hierarchy, spacing, theme, graphics and animation are separate design tasks. The screen hierarchy and user journeys are what we are validating now.

---

## A. iPhone — proposed primary surfaces

### A1. TODAY: one best next action

```text
┌────────────────────────────┐
│ Side Quest        Thu 29   │
│ TODAY                      │
│                            │
│ Your plan for today        │
│ ┌────────────────────────┐ │
│ │ Primary action         │ │
│ │ Strength: 30 min       │ │
│ │ [Review / Start]       │ │
│ └────────────────────────┘ │
│                            │
│ Rehab / clinical context   │
│ ┌────────────────────────┐ │
│ │ Current approved plan  │ │
│ │ OR needs review        │ │
│ │ [Open rehab]           │ │
│ └────────────────────────┘ │
│                            │
│ How are you doing?         │
│ [30s check-in]             │
│                            │
│ Why this plan? [Explain]   │
│ Data used / missing        │
│                            │
│ Today Plan Train Rehab You │
└────────────────────────────┘
```

**Primary question:** What should I do today and what will change if I report pain?

**Required behaviors**
- No competing primary CTAs. If urgent safety status supersedes exercise, show clinical next action rather than a shiny workout start button.
- A reason code can be expanded into "based on..." with sources and uncertainty.
- Existing PT program is not hidden behind settings. Lack of a clinical plan is explicit.
- Workout start, favorites, substitutions and Quick Workout share the same safety preflight.
- No fabricated pTSS readiness/threshold score.

### A2. REHAB: case overview and current approved plan

```text
┌────────────────────────────┐
│ REHAB                      │
│                            │
│ Your active conditions     │
│ ┌────────────────────────┐ │
│ │ Case A                 │ │
│ │ Recent symptoms       │ │
│ │ Clinical review status │ │
│ │ [Open case]            │ │
│ └────────────────────────┘ │
│ ┌────────────────────────┐ │
│ │ Case B / persistent    │ │
│ │ Next check-in          │ │
│ │ [Open case]            │ │
│ └────────────────────────┘ │
│                            │
│ Today’s approved PT work   │
│ [Review program]           │
│                            │
│ [Record new concern]       │
│ [Record flare]             │
│                            │
│ Today Plan Train Rehab You │
└────────────────────────────┘
```

The home state is different for **zero active cases**, **one active case**, and **multiple active cases**. A "resolved" episode must remain accessible in history.

### A3. CASE DETAILS: distinguish clinical instructions, symptoms and history

```text
┌────────────────────────────┐
│ ← Rehab  Case details      │
│ [Region / course]          │
│ [Diagnosis status & source]│
│                            │
│ WHAT MATTERS NOW           │
│ Clinician restrictions     │
│ Plan / review date         │
│ [View original instruction]│
│                            │
│ DO TODAY                   │
│ Authorized exercises      │
│ [Review / perform]         │
│                            │
│ RECORD                     │
│ [Symptoms + function]      │
│ [New event / flare]        │
│                            │
│ PROGRESS                   │
│ Latest comparable task     │
│ Coverage / date range      │
│ [View timeline]            │
│                            │
│ HISTORY                    │
│ Onset: exact/approx/unknown│
│ [See events] [Correct info]│
└────────────────────────────┘
```

**No clinical program?** Replace the exercise CTA with "Awaiting assessment / Add PT guidance" and appropriate referral, not a generic workout chosen by body part.

### A4. CAPTURE: two different entry types

**New concern:** mechanism, *actual onset date with uncertainty*, body region and side, impact/function, immediate concerning signs and escalation, description, source. A short front door can lead to a later structured assessment.

**Routine symptom update:** choose case -> select one task/context -> record symptom value, relevant functional capacity, during-session and next-morning response as appropriate -> optional notes. Avoid 14 mandatory fields every day.

**Flares:** choose an existing case, attach an event, event timestamp, functional change, and whether this is a new/worsening unexpected symptom. Never silently create a new case or reclassify a prior diagnosis.

### A5. TRAIN: execute with clinical context

```text
┌────────────────────────────┐
│ TRAIN                      │
│ Today’s session            │
│ Purpose / dose / equipment │
│ Clinical status: review... │
│ [Start / Request review]   │
│                            │
│ During the workout         │
│ [Set 1] [Set 2] [Set 3]    │
│ [Substitute if permitted]  │
│ [Record symptom response]  │
│                            │
│ Next-day follow-up         │
│ [Respond when appropriate] │
└────────────────────────────┘
```

If a new symptom is reported mid-workout, the user must be able to stop/log what occurred and receive an appropriately scoped safety message. The app must not lose completed sets or silently keep advancing a previous recommendation.

### A6. WHAT DOESN'T BELONG ON THE iPHONE HOME SCREEN

- Every source's raw TSS/HRV metric at once.
- Multivariate dose-response plots.
- Full medical/clinical evidence bibliography.
- Cross-source deduplication interface.
- Research model tuning.
- Long, vertically stacked reports used for clinician review.

These can remain discoverable in the desktop analytical workspace or a targeted detail route.

---

## B. Desktop web — proposed primary surfaces

### B1. OVERVIEW / longitudinal context

```text
┌──────────────────────────────────────────────────────────────────────┐
│ SIDE QUEST                              Athlete | Export | Privacy  │
├───────────────┬──────────────────────────────────────────────────────┤
│ Overview      │ Current goals + relevant restrictions               │
│ Timeline      │ Data coverage / import status                       │
│ Training      ├──────────────────────────────────────────────────────┤
│ Rehab         │ Upcoming training and approved rehabilitation       │
│ Analytics     │ [Review current plan] [Open active case]             │
│ Reports       ├──────────────────────────────────────────────────────┤
│ Data/Settings │ Recent events + observation reminders               │
│               │ All source labels visible                           │
└───────────────┴──────────────────────────────────────────────────────┘
```

### B2. TIMELINE: aligned evidence, not a causal assertion

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Timeline | Date range [          ] | Sport [ ] | Cases [ ] | Export │
├──────────────────────────────────────────────────────────────────────┤
│ Training exposure                 [dated plot; gaps remain gaps]    │
│                                                                      │
│ Symptoms and function             [task-specific, different axes]  │
│                                                                      │
│ Injury / clinical annotations     [onset]  [visit]    [flare]       │
│                                                                      │
│ Source quality and missingness    coverage | estimates | conflicts  │
├──────────────────────────────────────────────────────────────────────┤
│ Inspect one observation: source, date, unit, associated event, edit │
│ Comparison: explanatory context, not inferred injury causation      │
└──────────────────────────────────────────────────────────────────────┘
```

**Chart standards:** real date axes, labeled units, meaningful task context, same-measure comparisons, confidence and coverage, filters, data point inspection, keyboard/accessible alternatives. No automatic line drawn through unobserved injury-free days.

### B3. REHABILITATION: case workspace

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Rehabilitation | Cases: [A] [B] [+ Add]                             │
├─────────────────────────┬────────────────────────────────────────────┤
│ Case facts              │ Current restrictions / clinician source   │
│ Actual onset + certainty│ Approved protocol / versions              │
│ Diagnosis state         │ Function targets and relevant tests       │
│ Episode history         │ Symptom/load timeline with event markers  │
│ PT visits               │ Adherence and next-day response           │
│ Changes / audit         │ Unresolved questions and reassessment     │
├─────────────────────────┴────────────────────────────────────────────┤
│ [Add PT program]  [Correct onset]  [Make visit report]               │
└──────────────────────────────────────────────────────────────────────┘
```

### B4. REPORT BUILDER: preview before sharing

```text
┌──────────────────────────────────────────────────────────────────────┐
│ PT visit report   [Case: A] [Range: last 30 days]                    │
├───────────────────────┬──────────────────────────────────────────────┤
│ Include               │ Preview                                      │
│ ☑ Clinical context    │ Case status + clinician instructions        │
│ ☑ Task pain / function│ Date-axis symptom/function graphics         │
│ ☑ Approved exercises  │ Prescription vs actual + response           │
│ ☐ Unrelated training  │ Dated training and clinical events          │
│ ☑ Flare timeline      │ Missingness, source, uncertainty            │
│ ☐ Private notes       │ Questions for PT                            │
├───────────────────────┴──────────────────────────────────────────────┤
│ [Save private snapshot] [Export PDF] [Export CSV/JSON] [Cancel]      │
└──────────────────────────────────────────────────────────────────────┘
```

No clinician-facing reports are automatically public. If a patient decides to share them, the patient controls scope and can remove optional sensitive context.

---

## C. Information and component patterns

### Decision explanation

Every recommendation detail should be structured as:

- **Action:** What is advised or proposed?
- **Relevant evidence:** Which completed workouts, reported symptoms, approved clinical instructions and dates?
- **Reason:** Why this choice and what rules were used?
- **Uncertainty:** What was missing or inconsistent?
- **Control:** Who may approve, modify, reject or defer it?
- **Reassessment:** When should this be reviewed?

The **minimal** mobile display is action + short why + critical clinical restriction; the **desktop** display can inspect the full evidence/audit.

### Shared page states

For each screen design these states before coding:
- No history / first-time use.
- Active history and current program.
- Historical record without a validated protocol.
- Pending assessment and warning state.
- Multiple cases with conflicting load restrictions.
- Incomplete or stale data.
- Delayed sync or entirely offline.
- Editing a past event with downstream report versions.
- Share/export canceled, permission denied, interrupted.

### Wording conventions

- "Reported pain" rather than "injury severity" when diagnosis is unknown.
- "Candidate progression within approved plan" rather than "cleared to progress."
- "Observed difference" rather than "improvement" when direction of benefit is undefined.
- "Not recorded" rather than "zero" for missing data.
- "Upcoming training week" rather than "This week" for the first future week.
- "Condition / concern" until clinician diagnosis is documented.
- "Report with PT" rather than "PT-approved" when no approval source exists.

---

## D. Prototype test specification

Create a **separate non-production interactive prototype** using synthetic records and scripted state changes. It should let someone:

1. Find a new injury intake from Today in one direct route.
2. Enter a past injury date and distinguish it from today.
3. Find an existing case and log a flare.
4. View the PT-authorized plan, and see an explicit absence when none exists.
5. Start and record an approved workout without losing clinical context.
6. Visit the desktop timeline and filter to a selected injury episode.
7. View a report containing dated symptom and functional trajectories.
8. Correct a historical event and understand how the change affects the history.
9. Identify whether a recommendation is a clinical instruction or an app-derived suggestion.
10. Recognize that pTSS is **not** currently a validated feature.

**Test with a person who has not watched the prototype being built.** Track first-action accuracy, completion, misunderstandings and error recovery before implementing screens in Expo.

### Disposition of current rehabilitation beta

The already-built beta remains useful for **technical** testing (SQLite, backups, check-ins, reports, clinical preflight), but its current single-bar chart and nested entry point are **not** UX decisions to preserve. Do not merge its current visuals into a final navigation hierarchy merely because they run on an iPhone.

### Definition of a useful first version

A person with one clinician-assessed injury can: understand their current PT instructions, complete the permitted home exercise program, record a meaningful functional/symptom response, see how the response changed across *actual dates*, report an unexpected setback, and prepare a report for their PT—without becoming an expert in the internal architecture.

That complete journey is more important than a large library of disconnected tools.
