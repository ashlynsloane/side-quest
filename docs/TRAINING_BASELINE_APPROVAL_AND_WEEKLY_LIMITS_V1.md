# Training Baseline Approval and Frozen Planning Ceilings v1

**Status:** Draft, training-only. No pTSS model, injury treatment, medical clearance, automatic return to sport, or production release.

**Stacked implementation:** This branch builds on core training evidence PR #6, which builds on experimental guardrails PR #5. Both must be reviewed before any merge.

## User-facing journey

The athlete opens **Plan → Review source coverage and weekly limits** or **Weekly Review → Review training baseline and frozen limits**.

1. Select **Current week** (reviews the preceding completed Monday–Sunday) or **Next week** (not eligible until its preceding week finishes).
2. Inspect actual recorded training, known/estimated duration, running distance, cycling time, missing data and possible source conflicts.
3. Inspect activity sources and any active external **calendar** source's sync status. Calendar intent is not proof of completed exercise.
4. Explicitly attest coverage of all workouts (including off-app activity/rest), reconcile duplicates, review estimated durations, symptoms, training interruptions and clinical status, and write a substantive note.
5. Only if the period is complete, the data are sufficient, no conflicts remain, ordinary progression applies, and no unresolved clinician/pain restriction is on file can the athlete explicitly approve a **planning comparison baseline**.
6. Persist an append-only decision snapshot in the **active profile's SQLite database**. Freeze the three experimentally selected ceilings from the previously completed week. The saved source signature includes individual session dates, durations, run distances, source IDs and estimate flags.
7. Show approved ceilings, the current plan's known subtotal and **detected** weekly/rolling-seven-day overages. The rolling evaluator always labels coverage incomplete unless separately verified; no green "safe" status is displayed.
8. The athlete can explicitly **withdraw** the approval without deleting the original record.

## Constraints

| Guardrail | Policy |
| --- | --- |
| Run distance | Baseline × 1.10 |
| Bike minutes | Baseline + min(10%, 60 min) |
| Combined minutes | Baseline + min(10%, 60 min) |
| Adjacent long days | Review two days with ≥120 min each (the policy engine already supports this) |

All are **experimental upper ceilings**, not research-validated injury limits, training targets or medical permissions. There is no pTSS integration. An athlete can always train less and is never asked to "make up" missing volume.

An unmeasured or zero running baseline cannot authorize run progression. An illness, injury, rehab return, high-stress interruption, active PT profile or symptomatic restriction cannot be cleared by pressing a checkbox. Conditions that require medical assessment must be handled outside this arithmetic workflow.

## Evidence authority

This module distinguishes:

- **Imported or manually recorded:** a completed activity exists in the current database.
- **Reconciled:** known linked watch/Side Quest and plan/actual records are counted once; unresolved duplicates and source conflicts are flagged.
- **Athlete-attested:** the athlete states that all records, off-app training, estimates, gaps and symptoms were checked.
- **Provider-audited:** **NOT IMPLEMENTED**. No claim is made that current TrainingPeaks ICS, Strava or Garmin endpoints prove complete capture.

The app presently imports external **Strava-completed activities** and TrainingPeaks/ICS **planned calendar intent**. This is not the same as a fully audited Garmin + TrainingPeaks completed training history. A provider sync timestamp is surfaced as context, not a universal coverage certificate.

The approval snapshot uses the explicit basis:
`athlete_attested_not_source_audited`

An athlete must describe how they reviewed the information and cannot approve a period with unknown completed duration, unknown running distance, possible duplicated activity, incomplete week or query truncation. Estimated strength duration requires **explicit athlete review**; it remains an estimate in the canonical ledger, not a newly measured value.

## Privacy and audit

- New table: `training_baseline_review_events` created by a non-destructive `CREATE TABLE IF NOT EXISTS` statement in the existing profile-scoped SQLite initialization. No old workouts or PT records are changed.
- Review events are **append-only**, distinguishing an approval from revocation; original approval and explanatory notes are preserved.
- A saved baseline is **not usable** for policy comparison after an individual completed-session date, sport, measured/estimated dose or source ID changes, or after newly active clinical restrictions.
- On approval the service **re-reads** the source evidence and checks a signed-in profile/database identifier plus the expected source signature to reject stale submissions.
- A complete device backup/restore and profile-switching test is still required. SQLite persistence in code is not evidence that iPhone recovery has been validated.

## What remains to finish the full training milestone

1. **Provider-independent source coverage and full activity reconciliation.** Replace 2,000-history-record caps and incomplete external ingestion with well-scoped paged queries and reconciliation audits; a query hitting the cap blocks approval today.
2. **Actual activity duration for strength.** Wall-clock/linked wearable estimates are currently flagged and must be reviewed. Add a reliable distinction between elapsed, active and rest-adjusted time.
3. **Validated daily coverage and complete rolling checks.** Current UI identifies some overages but cannot certify safe or full compliance while daily source coverage or future frozen allowances are missing.
4. **Training generator integration:** The saved ceilings are currently **read-only**. They do not silently cap, rewrite, or approve the automatically generated week. Eventually show proposed changes and let the athlete deliberately accept/reject them while preserving exercise and calendar audit.
5. **Onboarding and weekly review usability:** Confirm the questionnaire establishes *self-reported* context versus measured exposure, and that returning athletes need not repeat it.
6. **On-device verification:** Test per-profile SQLite persistence, force-quit, profile switching, offline access, backup/restore, historical corrections, navigation, and accessibility before any production release.

## Automated tests

- Source completeness, week alignment, history immutability and signatures.
- Manual coverage/estimated-duration attestation and zero/unknown semantics.
- Injury/illness, clinical-active/unknown and recovery interruption gates.
- Exact frozen ceilings, non-green rolling status and existing policy regression suite.
- Planner and mobile TypeScript checks.

**Do not merge as a clinical guidance feature.** This is a transparent training-planning guardrail workflow with conservative incomplete-data handling.
