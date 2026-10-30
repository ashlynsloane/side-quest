# Side Quest — Core Training First (October 30, 2026)

**Priority decision:** Finish the athlete's ordinary training experience before connecting the rehabilitation engine or deploying research-derived pTSS modeling. Do not misrepresent user-selected exposure restraints as learned personalized thresholds.

## What the current retrospective pTSS work contributes

The research has not yet produced a defensible fitted personal PTSS score, injury threshold or minimum-effective-dose estimate suitable for deployment. It *did* motivate practical, **athlete-selected experimental planning ceilings** for running distance, cycling time, and combined time, including a review flag for adjacent long training days.

The exact policy, tests, baseline approval, timezone and source-accounting requirements are developed on **separate draft PR #5**, `feat/experimental-training-ramp-guardrails`. No policy is active in the iPhone UI until real baselines and source coverage can be verified.

## Product sequence — one complete training journey before deeper rehab

1. **First-run context:** Goal, sport background, recent *actual* training exposure and uncertainty, available training time, equipment and strength history, and a brief injury/restriction gate. Availability is not an established-tolerance baseline.
2. **First-week plan:** Produce scheduled, editable training with concrete exercises and doses from the actual generator. Distinguish session intent from any real completed activity and show uncertainty or needed clinical review, not fabricated clearance.
3. **Today:** Present one primary training action; make training logic intelligible without requiring a separate Coach tab, and allow easy rest, skip or modify.
4. **Train:** Start/resume and log the actual workout, movement choices, volume, symptom-driven changes and athlete feedback; preserve earlier work across app restarts.
5. **Plan/history reconciliation:** Deduplicate workout source views, replace corresponding planned events with completed exposures for accounting, and keep Garmin/TrainingPeaks provenance and missing fields.
6. **Weekly planning review:** Select and explicitly approve an eligible completed previous local week if ordinary progression applies. Evaluate frozen weekly and rolling guardrails in read-only form, including all sports and strength, then allow the athlete to accept/modify the next proposed week.
7. **Clinical / rehab connection later:** Only once the normal plan/workout/history loop works, connect verified injury/clinician restrictions across *all* workout entry paths, then add authorized rehab programs and PT reporting.

## Definition of done for core-training milestone

- A novice completes one questionnaire and gets an actual, inspectable first training week, not an unsupported "consider a session" placeholder.
- A returning athlete reuses stored history, and can edit goal, availability or equipment without repeating onboarding.
- Training days, individual exercises and planned doses have useful explanations and can be changed deliberately.
- A recorded workout persists and is not double-counted against its planned workout or second provider copy.
- A training interruption, unknown baseline, or incomplete calendar history is not treated as permission to progress from zero or resume.
- The three experimental caps are separately shown with the approved actual baseline and explicit missingness. They do not become performance goals or medical clearance.
- Rolling seven-day windows are considered in addition to Monday-Sunday week totals.
- An athlete can choose less training or rest without a completion penalty or pressure to compensate.
- Strong usability tests can be run from reusable state/checkpoints rather than repeated full onboarding.
- Automated regression, accessibility, actual-device persistence, and data recovery tests pass before production adoption.

## Integration safety

- Do not merge pTSS research data or private medical records into GitHub.
- Do not merge rehab draft PR #2 into production just to make the training policy active.
- Do not silently tighten or loosen the agreed ramp percentages and minute ceilings.
- Do not treat an iPhone beta installation as evidence of rehab clinical safety.
- Do not prescribe the current athlete a new progression during a reported training interruption; a separate assessed return path is required.
- No new production navigation tab for the guardrail calculator; explain it directly in Week/Plan where users already make decisions.

**Immediate engineering dependency:** Establish verified completed training exposure + approved baseline and source reconciliation before turning the pure policy module into a user-facing planning permission.
