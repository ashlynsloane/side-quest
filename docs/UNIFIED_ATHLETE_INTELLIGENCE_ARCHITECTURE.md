# Side Quest — Unified Athlete Intelligence Architecture (ADR 001)

**Status:** Proposed architecture; separate from shipping software and clinical approval.
**Decision:** One local-first athlete timeline, two independently tested research/decision-support engines, and one coordinated training recommendation layer.

## Vision

Side Quest aims to combine transparent training logging and analysis, useful visual feedback, personalized training-dose research, and clinically bounded rehabilitation support. It is initially for one athlete, but ingestion, data contracts, clinical rules, and scientific methods must be generalizable. **Never hard-code an athlete's physiology, injury pattern, medical events, or model coefficients into the product.**

This document describes the future architecture, not capabilities already shipped.

## Two cooperating projects, not a premature codebase merger

### Project A — Personalized training and injury-pattern research (pTSS)

Maintain its independent, reproducible analysis workflow to investigate:

1. Retrospectively, which combinations of sport-specific load, intensity, week-to-week changes, prior exposure, recovery and clinical context precede injury *episodes* or disruptions?
2. Which smaller training doses appear to achieve worthwhile, measurable improvements in specific fitness outcomes? This is an individual **dose–response / efficient frontier** problem, not the claim that a universal minimum produces maximum gains.
3. What dynamic load *envelopes* or training caps are supported by enough past observations to test, and which require clinician caution or uncertainty labels?
4. Do complex pTSS formulations outperform simpler baselines (e.g. sport-specific hours, TSS, intensity minutes, recent-load changes) on held-out time periods and pre-specified outcomes?

Preserve separate external-training and internal-response constructs. Traditional TSS, Garmin load/effect, wearable recovery signals, athlete soreness, menstrual/reproductive factors, and clinical restrictions are **not interchangeable measurements** and must not be summed without a defensible and validated model. Treat menstrual data as optionally relevant individual evidence, not a deterministic phase-based safety rule.

The current separate research workflow has *not* established fitted pTSS weights, a personal injury threshold, or a minimum-effective-dose estimate. Do not display these as measured facts until evaluated.

### Project B — Virtual rehabilitation decision support

Maintain a separate, evidence-versioned clinical model for:

- New traumatic, sudden-onset, gradual-onset, recurrent, persistent, and postoperative injury paths.
- Clinical safety triage and the limits of self-reported diagnostic certainty.
- PT-prescribed programs, explicit restrictions, standardized exercises, functional goals, symptom response, and reassessment requirements.
- Exercise/dose eligibility, maintenance, reduction, and candidate progression **only within approved clinical boundaries**.
- Causal uncertainty and proper handling of injury events whose origins are independent of training load, such as crashes/falls.

It must not act as an autonomous diagnostic service, override a clinician's limits, or infer that an unreviewed exercise is medically cleared.

## Shared canonical athlete timeline

Build a versioned, consent-aware **data contract** between the separate pTSS pipeline and Side Quest rather than copying raw Garmin/TrainingPeaks/medical archives into the app or public GitHub.

Minimum canonical entities:

| Entity | Must preserve |
| --- | --- |
| Athlete / profile | Stable private ID, optional consent and sharing policies |
| Source record | Provider, original ID, import batch, timestamp, units, provenance, correction history |
| Training activity | Canonical unique activity ID, sport, dates/timezone, duration, distance, intensity and source-specific stress values |
| Activity relationships | Linked TP/Garmin observations for the same underlying workout; multisport parent/child structure; no double counting |
| Training prescription / completion | Scheduled versus completed; planned and actual sets/reps/load where applicable; omitted workout distinct from missed data |
| Recovery context | Sleep/HRV and related measurements with device/baseline/coverage/quality; life stress and illness when reported |
| Health and menstrual context | Optional, permissioned and source-graded, including measurement coverage and calendar uncertainty |
| Injury case / episode / event | Durable case, onset date separate from record creation, acute flare/recurrence and trauma mechanism, clinical uncertainty |
| Symptom / function assessment | Task-specific metrics, timestamp, rating scale, unknown/missing distinction, daily delayed response |
| Clinical instruction | PT origin, applicability, allowed movement/dose, no-override restrictions, review/expiration without automatic clearance |
| Analysis output | Model version, source coverage, confidence, validation method, effective date, expiry/reassessment trigger |
| Decision audit | Inputs and uncertainty, selected plan, reason codes, contraindications, human override and observed response |

Store provenance and unit conversions, not just a normalized number. Private user-provided health records stay out of the public source repository.

### Injury-aware missingness

Never interpret missing TSS as zero load, absent Garmin as no activity, missing symptom checks as zero pain, or time away from structured training as healthy recovery. TrainingPeaks and Garmin may contain duplicate views of the *same workout*. They must be reconciled before computing exposure.

Historical periods the athlete reports as reduced or absent training due to injury/pain should be represented with the reported interruption reason and confidence, but gaps without corroborating records should remain uncertain. Do not fabricate workout intensity from duration alone; store estimates, methods, and uncertainty separately from measured values.

### Shared metric types

1. **Observed external training exposure:** sport-specific duration, distance, power/pace/HR-derived intensity measures, strength sets/repetitions/loads, terrain and impact when supported.
2. **Estimated standardized training load:** conventional TSS when reliable; recovered or modeled alternatives marked by method and confidence.
3. **Recovery and capacity evidence:** sleep/HRV/symptoms, previous tolerable loads, detraining/return-to-training, life stress, medical constraints.
4. **Outcome observations:** objective performance proxies, function, adverse symptoms and injury episodes. Outcomes must not be conflated with predictors in evaluation.
5. **Action constraints:** clinician limits, user preference, equipment/schedule, injury-specific contraindications.

A future pTSS can provide a transparent composite or interpretable multi-dimensional representation, but **no single score can replace clinical exclusions**.

## Separation of concerns and information flow

```
Raw/source archives and permissions
           |
 Versioned ingestion, provenance, de-duplication
           |
 Canonical athlete timeline (private / local-first)
          / \
         /   \
 pTSS research   Rehab knowledge and approved protocols
 (retrospective,  (clinical evidence, rules,
  validated)      response monitoring)
         \   /
          \ /
 Safety-first coordinated training decision
           |
 Daily plan, explanation, logged completion
           |
 Outcome observations -> future research feedback
           |
 Patient-approved longitudinal PT/coach export
```

A research-estimated safe training envelope is not equivalent to medical clearance; the decision layer applies active clinical restrictions first. It preserves permissible training for unaffected regions while respecting indirect exercise loading.

## Scientific evaluation plan

- Predefine meaningful performance outcomes for each sport and strength domain. Do not claim "maximum gains" from merely accumulating training or TSS.
- Evaluate the individual training-dose/frontier and injury-associated risk windows using time-aware splits and sensitivity analyses; avoid leakage from future rehabilitation/recovery information.
- Compare simple and complex load predictors; ensure the complex model improves out-of-sample performance or calibration.
- Differentiate traumatic injuries, gradual overuse patterns, persistent pain flares, surgery/clinical restrictions, and uncertain cases.
- Avoid universal arbitrary thresholds. Report descriptive findings, confidence, sparse historical support, alternative explanations and known confounders.
- Dynamic caps should account for recovery context, current rehabilitation restrictions, and short-term tolerance, with *no automatic training debt* after time away.
- Re-estimate individual parameters only under versioned, auditable rules; do not adapt safety bounds upward solely because of several high-load weeks without a recorded injury.

## Product and UI implications

Keep interfaces separate from scientific contracts. Once data and decision flows are stable, a single user experience can expose:

- Today's training + permitted rehab + clinically relevant questions.
- Training exposure and response history with source/quality labels.
- Injury and function timeline with correct historical onsets, flares and changing instructions.
- Useful charting and a patient-controlled PT/coach export.
- A clear explanation of why the system recommends, holds, changes or declines a session.

Do **not** redesign polished screens every time we introduce a new clinical or analytic capability. Fix misleading content and safety-critical interaction immediately, but defer visual consolidation until the underlying flows stabilize.

## Implementation milestones

**Milestone 0: Scientific/interface contract** — Compare the current separate pTSS analysis outputs with existing Side Quest SQLite injury/exercise/training records. Produce a mapping for IDs, units, timezone, session deduplication, missingness, and privacy. No raw medical archives in GitHub.

**Milestone 1: Generalizable import bridge** — Versioned read-only import of validated activity and contextual records. Preserve source, estimated-versus-measured distinctions, and sport-specific load; add deterministic fixtures/tests.

**Milestone 2: Historical injury and function reconciliation** — Editable historical onset dates (with revision audit), episodes, visits, PT instructions, function milestones and source confidence. Associate injury episodes with exposure windows without claiming causality.

**Milestone 3: Independent pTSS model artifact** — Export model outputs using a documented schema: model ID/version, features, interval, data coverage, predictions/caps, uncertainty, validation and caveats. Side Quest must function without a fitted model.

**Milestone 4: Clinical evidence and rehabilitation protocol registry** — Versioned references, applicable diagnosis and evidence quality, standardized exercise mapping, licensed content boundaries, clinician-defined dose and stop/progression criteria. Resolve exercise ID collisions before mapping.

**Milestone 5: Integrated safety-first planner and retrospective simulation** — Apply clinician limits before training optimizer suggestions; replay historical scenarios and test multi-injury interactions, missed data, acute trauma and recurrent flares.

**Milestone 6: One coherent athlete/PT interface** — Build daily coaching and clear longitudinal visualizations over validated data. Only after clinical and on-device QA, add patient-initiated reports and optional secure off-device backup.

## Definition of done for the next chunk

- Two research/code workstreams remain independently reproducible and testable.
- One *documented, versioned* interop contract identifies actual data shapes and missing inputs.
- No user private health data or inferred thresholds committed to public GitHub.
- At least one synthetic athlete timeline can join a deduplicated multisport session, an injury episode, a longitudinal function measure, an approved clinical restriction, and a deterministic report.
- No shipping clinical recommendations or production data migrations are enabled without device and clinician validation.

**Guiding principle:** Make the evidence interpretable and clinically bounded before making the product clever or visually polished.
