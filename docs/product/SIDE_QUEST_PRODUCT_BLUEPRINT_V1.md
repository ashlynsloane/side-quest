# Side Quest — Product Blueprint v1.0

**Status:** Product design / architecture proposal; not a claim of implementation or medical validation  
**Scope:** Whole-athlete training management and evidence-informed rehabilitation decision support  
**Product premise:** One trusted longitudinal athlete record; specialized, independently testable engines; distinct daily/mobile and exploratory/desktop interfaces  
**Owner:** Personal-first product, designed for later generalization  
**Branch:** `docs/side-quest-product-blueprint-v1`, created from the stable `sq2-experience-rebuild` branch  
**Companions:** `SIDE_QUEST_USER_JOURNEYS_AND_ACCEPTANCE.md`, `SIDE_QUEST_DELIVERY_PLAN_AND_GATES.md`

---

## 1. The north-star product

> Side Quest helps an athlete understand what training and rehabilitation are appropriate **today**, why that recommendation was made, what happened afterward, and how training and health have changed over time.

The eventual platform combines dependable workout and recovery records, useful visualization, structured rehabilitation support, and transparent planning decisions. It should feel effortless during a normal day while remaining sufficiently rigorous to withstand detailed inspection by the athlete, coach, or physical therapist.

**It is not a substitute for medical assessment, a system that infers diagnoses from symptom ratings, or a generic chatbot that invents exercise programs.** Clinical evidence and restrictions bound exercise selection and adjustments. Uncertainty is visible rather than hidden.

### Target outcomes

1. **Daily clarity:** Within seconds the athlete understands the proposed training, rehab, known limitations, and next action.
2. **Longitudinal continuity:** No injury, recurrence, workout, clinical instruction, or change in function is lost because it belongs to a different screen.
3. **Clinical usefulness:** Between appointments, the athlete can carry out clinician-approved rehabilitation, record response, and prepare concise evidence-based questions and reports.
4. **Training transparency:** A person can inspect observed versus estimated load, actual versus planned sessions, provenance, gaps, and reasons for modifications.
5. **Research discipline:** Exploratory personal training research does not become a deployed pTSS score or cap without appropriate validation.
6. **Generalizability:** The product's schemas and pathways are reusable; personal observations, thresholds, and medical records are not hard-coded.

### What not to optimize for

- Maximum number of features, tabs, generated charts, exercises, or wearable integrations.
- A new mobile screen for every database table.
- A single composite score that masquerades as a diagnosis or determines clinical clearance.
- Artificially seamless automation that conceals uncertainty or conflicts.
- An all-at-once port of the user's private pTSS research pipeline into production software.

---

## 2. Product decisions and boundaries

| Decision | V1 policy | Why |
| --- | --- | --- |
| Mobile and desktop | Separate **experiences**, shared domain contracts | Different tasks require different information densities |
| macOS native versus web | Start with a **responsive desktop web workspace**, not a native Mac app | Browser is simpler to prototype/test and less platform-specific |
| pTSS | Independent retrospective research; **no production import or fitted score yet** | Avoid deploying exploratory or misleading variables |
| Rehab | Structured, clinically bounded decision support | A phone cannot reproduce a PT's examination or authorize every loading decision |
| Interface development | Full journey -> data contract -> task prototype -> usability test -> engineering | Prevent repeated redesign of isolated screens |
| Clinical knowledge | Versioned guidelines, original structured summaries, PT instructions | A video demonstration alone does not establish when it is appropriate |
| User data | Local-first / minimal sharing; explicit sensitive-data export | Training and health records are private |
| Existing app | Treat it as an asset; **no wholesale rewrite yet** | Retain tested exercise generation, local history and existing workflows |
| Safety logic | Clinician instructions and unresolved acute concerns take precedence over fitness optimization | Fitness capacity is not medical clearance |
| Distribution | Keep old TestFlight data safe; use separate development builds for unvalidated changes | Prevent migration and installation data loss |

### Three distinct kinds of knowledge

- **Observed:** dated activities, loads, symptoms, tests, device measures, clinician-entered facts.
- **Interpreted:** ruleset explanations, clinically reviewed evidence summaries, classifications and descriptive trends.
- **Predicted/optimized:** modeled training tolerance or fitness response, with version, uncertainty, evaluation and limitations.

Every important recommendation must identify which category supports it.

---

## 3. The platform in one picture

```text
           Athletes' permitted information sources
   Workout log | Garmin/TP/Strava | Clinical records
              | Recovery | Injury events
                          |
        Versioned, provenance-aware event store
        (source IDs, dates, timezone, quality, revisions)
                          |
          +---------------+----------------+
          |                                |
    Training & load engine           Rehabilitation engine
    planning / history               clinical rules / programs
    current supported logic          clinician restrictions
    [future pTSS only after gate]     function / response tracking
          |                                |
          +---------------+----------------+
                          |
         Safety-first decision coordination
         rationale / uncertainty / audit / override
                          |
          +---------------+----------------+
          |                                |
    iPhone: do + capture              Desktop: explore + manage
    today's plan / rehab              history / case review
    concise check-ins                 analytics / evidence
    execute + record                  configuration / reports
          |                                |
          +---------------+----------------+
                          |
           Patient-controlled PT/coach export
```

**Important:** This represents a target architecture, not a claim that all blocks exist. In particular, the desktop application and a validated pTSS model are not implemented.

---

## 4. Surface contract — iPhone versus desktop

### iPhone: do, decide, record

The phone prioritizes short, high-frequency, context-sensitive actions:

- What should I do today?
- What rehab do I have permission to perform?
- Is any new symptom or event important to record or assess?
- How do I perform and log this session?
- How did I respond during and after?
- How has one measurable aspect of recovery changed?

**Mobile interaction budget (design targets, to validate in usability tests):** Current-day plan visible on entry; routine symptom check-in approximately 30–60 seconds; an existing approved rehab session accessible in no more than two intentional actions; important restrictions visible *at the point of action*.

The phone can contain concise progress cards and a full record detail view, but complex retrospective analysis belongs to desktop.

### Desktop web workspace: investigate, organize, configure

The desktop prioritizes tasks requiring comparison, interpretation, and editing:

- Explore time-aligned training, symptoms, clinical milestones, and interventions.
- Compare multiple injury episodes, specific loading patterns, and longitudinal measures.
- Review source coverage, discrepancies, estimates, duplicates and missingness.
- Add or correct historical injury dates and external clinical records with revision history.
- Understand which rehabilitation protocol is applicable and what evidence supports it.
- Construct carefully scoped PT / coach exports with data provenance and meaningful figures.
- Configure preferences, consent, data connections, and approved clinician instructions.

A desktop **research lab** may eventually examine pTSS outputs after scientific validation, but Side Quest's product workspace must not imply a model exists before it does.

### Task placement matrix

| Task | iPhone | Desktop web |
| --- | --- | --- |
| Today's training and rehab | Primary | Overview |
| Exercise execution / set logging | Primary | Optional review |
| Daily symptom / function check-in | Primary | Available |
| New injury / incident intake | Quick safety intake | Full history and editing |
| Flare and reassessment | Quick record and escalation | Longitudinal investigation |
| Upcoming plan and short-term adjustments | Primary | Detailed planning |
| Training over months/years | Summary | Primary |
| Multiple synced data source reconciliation | Status / alert | Primary |
| PT exercise instructions | Read/execute | Manage/review |
| Multivariate charts and uncertainties | Lightweight | Primary |
| Clinician report | Preview/share | Compose/export |
| Data provenance and auditing | Explain on demand | Full record |
| Research-grade pTSS exploration | Not in product | Separate research repo, not Side Quest today |

### Cross-device reality

A browser workspace does **not** automatically have access to the phone's private SQLite database. We must choose a secure and testable data strategy before claiming cross-device continuity:

1. **Early prototype:** synthetic/de-identified fixtures in the web workspace, with no live health sync.
2. **Possible interim transfer:** explicit export/import with integrity and version checking; do not silently migrate sensitive histories.
3. **Possible later sync:** encrypted transport, authentication, per-profile authorization, merge semantics, deletion policy, conflict reconciliation and verified restore. These are separate architectural and privacy decisions.

Until then, the two experiences may share schemas and designs without sharing live records.

---

## 5. Proposed information architecture

### iPhone — five top-level destinations (proposal, not a coded change)

```text
TODAY             PLAN              TRAIN             REHAB             YOU
  |                |                  |                 |                |
What's next?     This week        Start/resume        My active case(s)  Preferences
Short check-in   Adjust schedule  Quick workout       Approved plan(s)  Data/accounts
Why this plan?   Review changes   Exercise execution Daily check-in     Privacy / help
Safety status    Later goals      Workout history    Events/flare       Connections
                                   /past sessions     Case detail
                                                     Progress snapshot
```

**Coach is a capability throughout the product, not necessarily a permanent top-level tab.** Explanations appear beside the decisions they explain; the user should not need to navigate to an independent tab just to understand why the app changed something.

**Rehab is a first-class destination**, not hidden under Readiness, Recovery guardrails, or generic account settings. An athlete with no active case sees a clean empty state and a clear route to report a concern. Users can bypass optional complexity during ordinary training.

Proposed mobile hierarchy:
- Today: priority action, upcoming session, rehab requirement, today's readiness, relevant safety/review alert.
- Plan: 7-day view, planned versus completed status, adjust/recover/reschedule.
- Train: start/resume, log, substitute within restrictions, exercises, history.
- Rehab: injury cards, current authorized care plan, new event, task-specific check-ins, progress.
- You: profile, goals, data connections, clinical consent, privacy, exports and settings.

### Desktop — analytical workspace

```text
OVERVIEW
  Summary, current priorities, unresolved issues, recent training/health changes

TIMELINE
  Synced training, injury events, rehabilitation, clinical visits and measurable outcomes
  Controls: date window, sport, injury case, measure context, source visibility

TRAINING
  Calendar, log, plan versus actual, sport-specific exposure and intensity
  Exercise history, adherence, workout provenance, discrepancies

REHABILITATION
  Case index -> case workspace -> timeline / restrictions / approved program
  Function and symptom series, protocol evidence, revision history, clinician questions

ANALYTICS
  Descriptive, transparent charts; data-quality flags and reproducible views
  No speculative pTSS scores, individualized risk guarantees, or unvalidated predictions

REPORTS
  Build, preview, select scope, redact, export, optionally share

DATA & SETTINGS
  Connected sources, import health records, backups, privacy, definitions, review status
```

Desktop charts should support linked brushing, consistent date axes, gap markers, unit-aware comparisons, overlays of *reported* events, and access to original data. **Avoid a dashboard full of unsupported correlations.**

---

## 6. Product modules and source of truth

| Domain | Canonical record | Current foundation | Planned responsibility |
| --- | --- | --- | --- |
| Identity | Private athlete/profile | Local per-user SQLite profiles | Secure cross-surface identity and access policy |
| Calendar and planned training | Scheduled session | Existing calendar and block records | Reliable plan/actual distinction |
| Completed training | Workout and exercise performance; endurance events | Workout ledger; endurance activity records | Dedup, provenance, corrections, coverage |
| Readiness | Time-stamped dimensions, context | Existing readiness check-in | Explain when used; separate from injury clearance |
| Injuries | Case, distinct episode, event, onset vs recorded date | Rehab feature branch prototype | Full revision history, multi-case constraints, clinician input |
| Rehabilitation | Clinical plan, authorized exercise, response, functional measure | Prototype data structures and preflight | Evidence registry, clinician review, versioned progression |
| Exercise catalog | Stable movement ID, aliases, loading metadata | Existing catalog and generator | Resolve duplicate IDs; clinically reviewed mapping |
| Decision audit | Recommendation, rule, inputs, disposition | Fragmented coaching/planner history | One unified explainability record |
| Reports | Reproducible filtered longitudinal dataset | Rehab prototype text report | Date-axis charts, coverage, safe export and redaction |
| Training research | pTSS analysis provenance and modeled outputs | **Separate project outside this repo** | No integration until validated |

### Longitudinal time semantics

Every health event needs at least:
- **Occurred/onset date** with timezone, precision (exact/approximate/unknown), and provenance.
- **Recorded-at date** when it was entered into Side Quest.
- **Updated/revised-at** plus a durable change record rather than silent history replacement.
- **Case relationship** (existing episode, recurrence, or new issue) and clinical certainty.

A visit date, symptom onset, assessment date and data-entry date are not interchangeable. Missing observations are not normal days, zero load, or zero pain.

### Data trust and uncertainty

- Externally reported activity, device-derived stress and manually entered loading must retain source and units.
- Planned activities must not be counted as completed.
- Garmin and TrainingPeaks descriptions of one workout must not be counted twice.
- PT restrictions must not disappear merely because a check-in is favorable or a review date passes.
- Traumatic injuries and gradual overload injuries should not share an assumed causal model.
- Clinician-reported diagnosis, athlete-reported concern and uncertain symptom labels must display different authority.
- An exercise ID alone is insufficient for medical safety; direct and indirect load annotations need review.
- The app must operate sensibly without Garmin, TrainingPeaks, menstrual records or pTSS.

---

## 7. Primary decision loop

```text
A. Establish today's context
   Current training plan + reported readiness + injury events + recorded restrictions

B. Check clinical safety
   New red flags / unexplained significant change?
      -> urgent / appropriate clinical evaluation; do not auto-clear injury loading

C. Check approved rehabilitation scope
   Applicable diagnosis? clinician limits? verified protocol? authorized alternatives?
      -> candidate rehab exposure only if the requirements are satisfied

D. Decide training within allowed scope
   Preserve relevant strength/endurance goals without overriding medical limits

E. Present one comprehensible decision
   What to do, what to avoid, why, what data is uncertain, when to reassess

F. Record reality
   Completed/skipped/modified exercise, symptoms during + delayed response, relevant notes

G. Review with human / advance when appropriate
   Approved plan and progression criteria govern; preserve all historical decisions
```

Current Side Quest contains pieces of this loop. **They are not yet wired into one clinically verified path.**

---

## 8. Virtual PT product scope

### Appropriate goals
- Recognize different categories of injury and recurrent flares as *workflow contexts*, not definitive diagnoses.
- Explain reputable guideline recommendations and their limits.
- Deliver and track clinician-approved home exercise programs.
- Support prescribed exercise variations and response-based adjustments within explicit limits.
- Quantify adherence, functional progress and meaningful setbacks.
- Prepare an accurate short report or question list for a PT.
- Recognize when symptoms require reassessment and when the app cannot safely advise.

### Prohibited claims and actions
- Confidently diagnose a new injury from self-report alone.
- Autonomously determine structural tendon integrity, fracture status or neurological diagnoses.
- Override surgical/postoperative precautions or clinician load restrictions.
- Auto-select an inappropriate generic protocol just because pain is in a named body region.
- Treat symptom improvement or a few stable days as automatic return-to-sport clearance.
- Copy commercial PT platforms' proprietary content wholesale without authorization.

### Model safety policy
**Clinical prohibitions > verified clinician-authorized exposure > conservative exercise screening > training optimization.** Manual athlete preference can be more restrictive but cannot automatically override an active clinician-origin prohibition. When the evidence is inadequate, explain the gap and route for review.

---

## 9. What the platform should feel like

A trustworthy experience communicates:

1. **Action:** What am I being asked to do?
2. **Context:** Why now?
3. **Authority:** Is this based on an actual PT instruction, a published guideline, a stored workout, or a preliminary calculation?
4. **Control:** Can I edit, defer, decline, or ask for review?
5. **Continuity:** Where does this information go, and will it be available next week?
6. **Visibility:** Can I see the source and understand uncertainty without wading through raw research every day?

Do not use badges such as "safe", "recovered" or "injury-proof" unless a clinically supported meaning is defined. Avoid visually implying that one bar at pain 4/10 establishes progress.

### Key anti-patterns from real device testing

- **Hidden navigation:** Rehab requires a path through unrelated readiness/settings screens.
- **Pseudo-analysis:** A single unlabeled bar masquerades as a longitudinal plot.
- **Onset conflation:** "Injury started" accidentally defaults to "record created today" without correction.
- **Calendar ambiguity:** "This week" can refer to an upcoming first programmed week.
- **False sense of clearance:** A heavy workout can be generated while active injury issues are not reconciled with the generator.
- **Unfinished workflow:** A case can be created, but a person cannot yet understand or complete an authorized rehabilitation course.

These observations are requirements for the redesign, not reasons to keep rewriting isolated screens.

---

## 10. Product quality gates

A new feature is **not done** because it saves data or renders on iOS. It must satisfy:

1. **Correctness:** Deterministic domain tests, validated input, missingness rules, actual data migration/restore, stable record IDs.
2. **Safety:** Identified clinical limits, no unsafe automated substitutions, explicit referral, adversarial scenarios.
3. **Discoverability:** Independent users locate the task without coaching; entry point has an expected label and location.
4. **Task completion:** The user reaches an appropriate outcome and can recover from errors.
5. **Clarity:** Plan versus actual, observed versus inferred, current versus historical, and clinical versus training authority are visible.
6. **Persistence:** Date/time, profile isolation, restart, backup/restore and corrections verified on device.
7. **Privacy:** No unintended health-data sharing, consented and reviewable export, minimal permissions.
8. **Accessibility:** Large tap targets, screen-reader labels, readable chart alternatives and usable error messages.
9. **Reproducibility:** Versioned evidence, test fixtures, CI, and a change log for rules and recommendations.
10. **Operational reality:** Resilient to offline use, no subscriptions by default, predictable local data ownership.

See the companion journeys and delivery plan for testable acceptance criteria.

---

## 11. Now / next / later

**Now — Design and foundation, no new production UI:** Catalog and reconcile existing functional domains, create complete journeys, validate historical injury corrections, backup and export, create low-fidelity interactive prototypes, establish usability acceptance tests. Stabilize data contracts, especially exercise identifiers.

**Next — Useful minimum end-to-end rehabilitation vertical:** One selected, clinically approved protocol plus case history, functional tracking, safe session execution, next-day response, clear revision semantics, PT report and on-device qualification. An injury need not be fully resolved to remain usefully tracked.

**Next — Desktop analytical prototype:** Build a browser-based, **synthetic-data-first** athlete timeline and injury-case review. Test interactions before authorizing any real personal data sync or distribution.

**Later — Generalize clinical protocols and coordinated planning:** Larger evidence registry, PT program import with clear provenance/licensing, appropriate exercise mapping and clinical review, better exports, supported integrations.

**Research-dependent — pTSS and minimum effective dose:** Remain exclusively in independent retrospective analyses until meaningful results, data quality and validation warrant a new product decision. No prematurely deployed personal thresholds.

---

## 12. Success measures (design targets, not observed results)

- Daily routine tasks are found without guidance and completed with little friction.
- Clinically relevant new events are recorded with onset date separate from entry date.
- A person can explain every active constraint and why a planned exercise is or is not eligible.
- All longitudinal figures show actual time axes, measurement context, missingness and provenance.
- PT reports use only user-selected, dated information and are comprehensible without verbal translation.
- No previously persisted workout or injury record is lost in updates, imports, account switching, or migration.
- A clinician can review plan history, outcomes and changes without reconstructing them from memory.
- pTSS remains clearly labeled as exploratory until validated, with no unsupported personal overtraining cutoff in Side Quest.

### Decisions intentionally unresolved

- Sync model (patient-controlled encrypted sharing versus a full private cloud backend).
- Web runtime and specific charting framework.
- Whether clinician review is via imported signed/attested instructions or direct portal access.
- Which clinical protocols first enter the formal evidence registry.
- Whether mobile navigation retains five tabs or uses a different structure after prototype testing.
- Commercial exercise content licensing and any future external PT platform integrations.

These are **design decisions to test**, not reasons to stall the scientific and clinical foundations.

---

**Version-control rule:** This blueprint is the product source of truth for interface strategy. Clinical evidence and software correctness live in separately reviewed, versioned specifications. The independent pTSS research repository retains its own scientific provenance and is not imported through this documentation branch.
