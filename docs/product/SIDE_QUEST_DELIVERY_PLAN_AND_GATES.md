# Side Quest — Delivery Plan, Dependencies and Quality Gates

**Companions:** `SIDE_QUEST_PRODUCT_BLUEPRINT_V1.md`, `SIDE_QUEST_USER_JOURNEYS_AND_ACCEPTANCE.md`  
**Status:** Planning baseline, not an estimate of completion time or a product release promise.  
**Rule:** Do not advance unfinished functionality into TestFlight merely because backend code exists.

---

## 1. Current-state inventory (audited from `sq2-experience-rebuild` plus rehab beta work)

| Capability | Evidence found | Current maturity | Implication |
| --- | --- | --- | --- |
| iPhone navigation | Today / Week / Train / Coach / You in `(tabs)/_layout.tsx` | Shipped architecture, usability issues observed | Redesign IA at journey level |
| Weekly plans / strength generator | Calendar, block, exercise and planner packages | Implemented; not clinically unified | Reuse, don't rewrite blindly |
| Completed workout history | Local SQLite workouts/performance; training history UI | Implemented baseline | Can become canonical exposure source |
| Readiness | Five-dimension daily check-in | Implemented | Distinguish recovery readiness from injury clearance |
| PT restrictions | `pt-profile.tsx` and PT types | Implemented older planning path | Must reconcile with clinical injury cases |
| Connections | Historical TrainingPeaks calendar intent and Strava/Supabase workflows | Existing integration foundation; coverage unverified | Audit source authority and duplicates |
| Local identity and storage | Per-profile SQLite; privacy-data export actions | Existing implementation | Validate backup, profile switching and sensitive export |
| Generalized injury record | Draft rehab branch `feat/generalized-injury-engine-v1` | Beta prototype, not merged | Preserve and iterate behind tests |
| Injury mobile UI | New issue, flare, check-in, initial progress, text share | On-device exploratory prototype; UX gaps observed | Treat as test harness, not final UX |
| Injury check-in persistence | On-device test: one case and pain entry survived full restart | **One device-confirmed scenario** | More multi-case and restore tests needed |
| Injury onset correction | Initial date-entry support on rehab feature branch | Implemented in code; not confirmed on device | Add full historical edit audit |
| PT evidence/protocol registry | Proposed; preliminary rules | Not clinically validated | Requires reviewed sources and approval workflow |
| Meaningful time-series report | Text / simple unlabeled bar on rehab prototype | Not sufficient | Desktop-first chart/data design |
| Desktop web workspace | None established from current app repository | Not built | Start with synthetic, non-sensitive interactive prototype |
| pTSS personal models | Separate research project (outside repo) | Ongoing analysis; no verified product metrics | **Do not integrate yet** |

**Evidence caveat:** Code existence does not establish a feature works across all profiles, devices, data conditions, or clinical scenarios. A single on-device persistence test is narrower than a full recovery qualification.

## 2. Dependencies and order of operations

```text
A. Product blueprint + acceptance criteria
                 |
     +-----------+------------+
     |                        |
B. Canonical records       C. UX journey prototypes
   provenance/revisions       desktop and mobile
   clinical constraints       synthetic data first
     |                        |
     +-----------+------------+
                 |
D. One end-to-end, clinician-bounded rehab vertical slice
                 |
E. Human/device QA, safe backup/restore, data privacy
                 |
F. Production mobile integration + desktop read-only analytics
                 |
G. Broader clinical programs, approved interoperability, refined reports

Separate track throughout:
pTSS personal research --> independent validation --> optional future product decision
(No arrow to the app until the evidence gate passes.)
```

Do not create a synchronization backend just because there are two envisioned interfaces. Design records and export formats first; choose storage and sync based on demonstrated workflows, privacy review and technical feasibility.

---

## 3. Workstreams, deliverables and acceptance gates

### Workstream A — Product and UX design (next priority)

**Deliverables**
- Information architecture with proposed mobile and desktop navigation.
- Low-fidelity end-to-end prototypes: normal day, new injury, persistent flare, PT home program, PT review, historical timeline.
- State inventory: loading, empty, incomplete, uncertain, offline, clinical prohibition, urgent evaluation, data conflict.
- Written content patterns for action, source authority, missingness, restrictions and errors.
- Short unaided usability tasks and test protocol.

**Gate:** A user can find and complete each core task in a prototype without technical guidance, and can distinguish a recorded observation from a clinical instruction or suggestion. No high-severity safety misunderstanding remains. **No production UI redesign before this gate.**

### Workstream B — Longitudinal data integrity

**Deliverables**
- Stable source-linked IDs and method-specific units; versioned data dictionary.
- Injury `occurred_at` versus `recorded_at`, exact/approximate/unknown precision, case/episode relationship, revision log.
- Formal diagnosis/restriction provenance and audit.
- Reconciliation between legacy PT constraints and longitudinal injury cases.
- Reliable device backup/restore, profile-switching isolation, cross-version migration QA.
- A safe import/export contract for future desktop analytics.

**Gate:** Synthetic and real-device tests show case/event/workout persistence, edits without loss, no duplicated activity accounting, recoverable backups, no cross-profile leakage. Do not use private medical records as GitHub fixtures.

### Workstream C — Rehabilitation clinical knowledge

**Deliverables**
- Evidence-source registry: source, publication, applicability, exclusions, strength, clinical review date, version.
- Exercise catalog canonicalization: stable unique IDs, aliases, loading patterns, reviewed risk metadata; resolve collisions tracked in existing GitHub issue #3.
- Clinical protocol assignment and permissions: authorized exercise, dose, limits, progression/hold/reduce criteria, reassessment trigger.
- Explicit clinic-origin restrictions and safety-first selection.
- Scenario tests: new trauma, suspected alternative diagnosis, persistent flare, postoperative constraint, several simultaneous cases, missing data.

**Gate:** External clinician reviews clinical-specific decisions and protocol applicability. No autonomous treatment progression outside a verified and authorized plan. Commercial exercise video/text licensing respected.

### Workstream D — Training and coaching continuity

**Deliverables**
- Planned-versus-completed training reconciliation.
- Endurance load source labels, exercise-level strength volume, measured-versus-estimated distinctions.
- Training decision audit explaining why a session is included, moved, held, or reduced.
- A unified planner safety preflight with the same restrictions used during execution, substitutions and late symptom updates.
- Offline and resumed-session behavior.

**Gate:** A restriction cannot be bypassed via Quick Workout, Smart Swap, repeating a favorite, changing a session, or reopening one. Existing historical workout data remains intact and unaffected activity remains appropriately available.

### Workstream E — Desktop analytic workspace

**Deliverables**
- Synthetic-data-first responsive browser prototype.
- Timeline with date axes, observed data and context, source filters, missingness and uncertainty.
- Injury case detail with flares, visits, functional measures and PT programs.
- Training log with source and de-duplication review.
- Report composition with selectable scope, provenance and exclusion/redaction.
- Formal data-access and future sync decision record.

**Gate:** Desktop can reproduce a clinical longitudinal view from versioned test data; no sensitive health data enters hosted development tooling without explicit authorization and a reviewed security model.

### Workstream F — pTSS independent research

**Deliverables in separate research project only**
- Quality audit of Garmin, TrainingPeaks, medical, menstrual and injury sources.
- Reliable treatment of zero/near-zero or otherwise unreliable source TSS values and supported estimation methods.
- Predefined injury episode outcomes, appropriate temporal windows, activity-type separation and sensitivity analysis.
- Exposure-response analyses and sport-specific performance outcome definitions.
- Comparison of simple baselines and complex personalized approaches, with temporal validation and uncertainty.

**Gate before any Side Quest integration proposal:** Executed results, reproducible methodology, held-out performance (where feasible), source coverage, leakage analysis, robust interpretation and demonstrated prospective decision usefulness. There is no commitment to deploy a pTSS scalar if it does not outperform transparent simpler baselines.

---

## 4. Milestone plan and exit criteria

| Milestone | Output | Exit criteria |
| --- | --- | --- |
| M0 — Blueprint | These three documents and tracked decisions | Explicit mobile/desktop roles, eight journeys, scope and gates accepted |
| M1 — Design proof | Clickable **synthetic-data** mobile/desktop low-fidelity flows | Unaided task tests, safety/uncertainty comprehension, navigation changes documented |
| M2 — Record correctness | Canonical injury history, corrections, restrictions and export contract | Migration, backup/restore and provenance regression tests |
| M3 — Rehab vertical slice | One clinically reviewed protocol integrated with a complete injury episode, PT exercise execution and response tracking | End-to-end patient scenario and professional review succeed |
| M4 — Training integration | Clinically bounded unified plan/execute/review path | No restriction bypasses; previous training remains correct |
| M5 — Useful analytics & reports | Desktop timeline and reproducible PT export | Accurate dates, coverage, provenance, selectable scope, readable charts |
| M6 — Controlled beta | Opt-in mobile beta with revised IA and recoverable data | Device QA, accessibility, privacy and clinical gates passed |
| M7 — Broader athlete platform | Generalizable intake, programs and optional secure sync | Incremental releases and measured product usefulness |

These milestones are dependency-oriented, **not time estimates**, and can be split into small independent PRs. No requirement to build M7 or implement a native Mac app.

---

## 5. Backlog with engineering boundaries

### Critical / do now
- Preserve phone data; do not merge rehab beta to the stable app by default.
- Solve critical correctness issues: historical injury dates and revision audit; event creation versus occurrence; exercise catalog identity collisions.
- Inventory duplicated PT restriction representations and make their precedence explicit.
- Design one complete new-injury and one persistent-flare journey **before** more screens.
- Specify role-appropriate navigation for mobile and desktop.
- Create synthetic test cases and usability scripts for a prototype.

### High / before rehabilitation is relied upon
- Functional measures and meaningful progress goals, not just 0–10 pain.
- Clinician-authored dose/protocol tracking and medical safety review.
- Source-consistent timeline and labeled trend graphics.
- Backup/restore on iPhone, profile isolation and versioned export.
- Prevent workout/rehab restriction bypass through alternate entry points.

### Medium / after first complete journey
- Robust cross-device desktop view of selected and consented health information.
- Clinical report PDF and structured data package.
- Approved PT-program import and verified exercise mapping.
- Deeper training history exploration with source QC.

### Research-dependent / explicitly deferred
- pTSS weights, individualized ramp-rate caps, minimum effective dose estimates.
- Menstrual/recovery prediction based on unvalidated signals.
- Machine-learned injury risk percentages or automated clinical judgments.
- Full multi-user clinician portal, social coaching of clinical data, commercial content scraping.

---

## 6. Evaluation matrix

| Dimension | Test | Failure is |
| --- | --- | --- |
| Accuracy | Raw dates, units, provenance, IDs, duplicate handling | Misleading or incorrect history |
| Safety | Acute uncertainty, clinician restriction, multiple cases, swaps | Unsafe recommendation or bypass |
| Task value | Scenario can be completed without developer help | Feature is not ready despite compiling |
| Navigation | Blind user starts in a sensible location | Deep, nonobvious route |
| Interpretation | One chart can be read without oral explanation | Undated chart or unsupported conclusion |
| Reliability | Cold launch, force-close, offline, account switching | Record loss or wrong profile |
| Privacy | Explicit consent, redaction, export scope, no implicit cloud writes | Data shared or exposed unintentionally |
| Maintainability | Pure domain core, tests, versioned contracts, minimal duplication | UI and backend drift |
| Scientific credibility | Clear observational vs inferred model, robust baseline | False sense of personalized certainty |

### Required checks at merge and at release

**Merge:** relevant unit/integration tests, TypeScript, domain fixtures, code review, migrations tested, feature flags, documentation updated, no baseline regressions. Track and resolve unrelated historical validator failures separately rather than incorrectly calling them green.

**Device beta:** isolated bundle ID where warranted, backup verified, reinstall/restore path, profile testing, navigation comprehension, safety-critical tests, offline behavior, final accessibility sweep. All clinician-relevant functionality must be reviewed before representing it as therapeutic guidance.

**Clinical reliability:** track what guidelines were used, which recommendations are authorized, who reviewed them, and what symptoms require review or urgent care. A computationally consistent but clinically unvalidated rule is still a prototype.

---

## 7. Decision log

| ID | Decision | Status |
| --- | --- | --- |
| D-001 | iPhone is daily action; desktop web is deep exploration | Proposed for design validation |
| D-002 | Continue pTSS scientific work independently | Adopted; no integration work now |
| D-003 | Clinical restrictions override training optimization | Adopted design invariant |
| D-004 | Rehab must be a discoverable first-class task | Proposed IA; validate placement in prototype |
| D-005 | One canonical record with event/revision provenance | Target architecture |
| D-006 | Start with responsive web, not native macOS | Default recommendation; revisitable |
| D-007 | Desktop prototype first uses synthetic/de-identified data | Adopted safety boundary |
| D-008 | No large polished UI rework until complete journeys are tested | Adopted development process |
| D-009 | No pTSS metric in shipped Side Quest until research gate | Adopted |
| D-010 | No autonomous diagnosis or override of clinician restriction | Adopted clinical constraint |
| D-011 | Cross-device sync mechanism | Open; security/privacy architecture needed |
| D-012 | Final mobile tabs and exact desktop technology | Open until UX testing |

---

## 8. Next concrete work package (not more production UI)

**Blueprint-to-prototype package**

1. Turn journeys 1, 2, 3, 4 and 5 into paper/clickable low-fidelity user flows. Include empty/uncertain/urgent states.
2. Build **synthetic** dated records for three scenarios: unaffected training, sudden traumatic injury, persistent recurring condition with PT-approved program.
3. Create task-level interactive mockups for mobile Today/Rehab and desktop Timeline/Rehabilitation/Report.
4. Run task-discovery and clinical-language checks; revise structure before feature coding.
5. Audit existing domain and SQLite records against this flow; create separate small implementation issues rather than a monolithic rewrite.
6. Keep the pTSS research pipeline independent. Revisit product inclusion only after evidence warrants it.

**Definition of done:** We can describe precisely what an athlete sees and does, where each datum comes from, how uncertainty and restrictions are handled, and how an approved treatment journey connects to the next visit—**without having to build and install another app just to find out whether the concept makes sense**.
