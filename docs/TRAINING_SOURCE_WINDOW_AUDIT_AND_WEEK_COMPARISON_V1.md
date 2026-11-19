# Training Source Audit and Proposed-Week Comparison — Milestone v1

**Status:** isolated draft implementation, not a released app. Base is baseline approval PR #7, which depends on source evidence PR #6 and experimental policy PR #5.

## Why this milestone exists

The prior weekly audit called `loadTrainingHistory(2000)`, which returned the latest **2,000 lifetime** strength/endurance records. A week further back than that limit could appear falsely empty even though its activities were present in SQLite. Additionally, activities close to the Sunday/Monday boundary, malformed stored rows, ambiguous double imports and unknown distances must not silently produce a green planning recommendation.

## What this branch implements

### Date-scoped, paginated local training evidence

- Query a conservative timestamp envelope around the specific **athlete-local Monday–Sunday** week. This includes UTC+14, UTC−12, Denver DST boundaries and multi-sport sessions near midnight.
- Read strength workout ledger rows and external completed activity rows in deterministic offset pages rather than taking the latest lifetime records.
- Compare the number of successfully decoded rows against **raw database counts** per source, before and after page reads; query failures, damaged JSON, concurrent count changes and page ceilings produce explicit incomplete-audit warnings.
- Keep the general Training History screen's previously bounded behavior unchanged.
- Preserve linked workout/sensor relationships; a linked watch record is not a second workout.
- Retain deleted/ignored activity provenance but exclude it from completed training exposure, without deleting records.
- Flag candidate duplicate **completed** sessions from different sources on the same local day with very similar duration (and for runs, comparable distance). Do **not** auto-merge; both may be separate genuine sessions, so manual review is required.
- Flag workouts crossing local midnight, including ambiguous elapsed-time metadata. Their daily placement requires review before making long-day-spacing or rolling checks authoritative.

### Training-week comparison

- Compare proposed known **running distance, cycling minutes and combined-training minutes** independently against the previously frozen experimental ceilings.
- Expose `over_ceiling`, `possible_overage`, `uncertain`, `no_approved_progression` or `below_ceiling_provisional`, never "safe", medically cleared, or a training target.
- Highlight which records have unknown duration or running distance and why source overlap makes a calculated overage *possible* rather than definite.
- Show record-read counts and proposed-versus-limit explanations in the existing **Training Baseline Review** UI, reachable from Plan and Weekly Review.
- Continue to show rolling seven-day *detected* overages separately with explicit incomplete-data warnings; do not infer verified pass or automatically reduce/raise a workout.

## Safety and statistical interpretation

- The experimental 10% + 60-minute ceilings remain **user-selected upper constraints**, not fitted pTSS thresholds, medical findings, a dose recommendation or return-to-sport clearance.
- A verified raw SQLite query means only "the local database rows were read", not "Garmin/TrainingPeaks/Strava captured every workout". Athlete review remains required, and provider-completeness remains unverified.
- An estimated duration is still estimated even when manually attested.
- Planned training is not completed training. Unknown planned running distance is not zero miles. Missing workout duration is not zero minutes.
- If an app record appears duplicated, the visible sum may be an overcount; a possible overage is not automatically a definite one.
- Positive room under a ceiling is **not a prescription to use that room**.
- Active clinician restrictions and unresolved illness/injury interrupts the ordinary-progress review. No rehab engine is merged.
- Individual date allocation for cross-midnight sessions still requires a true split; this branch detects and blocks unjustified confidence rather than inventing the split.

## Technical files

- `apps/mobile/src/services/database.ts`: stable offset paging for date-range activity reads and raw row counts.
- `apps/mobile/src/services/training-history.ts`: reusable existing history merger plus new date-scoped paged audit.
- `apps/mobile/src/services/core-training-week-evidence.ts`: source diagnostics, accurate local-week selection, cross-midnight review flags.
- `packages/planner/src/training-source-window.ts`: deterministic UTC query envelope.
- `packages/planner/src/core-training-week-evidence.ts`: source conflict review and cross-midnight helper.
- `packages/planner/src/training-week-comparison.ts`: safe, read-only proposed exposure comparison.
- `apps/mobile/src/services/training-baseline-review.ts` and `apps/mobile/src/app/training-baseline-review.tsx`: connect comparison and source-quality details.
- Unit tests: `training-source-window.test.ts`, `training-week-comparison.test.ts`, extended `core-training-week-evidence.test.ts`.

## Acceptance / verification gate

- Date-scoped history contains old but relevant training even when later history exceeds the former lifetime limit.
- A complete empty local week is distinguishable from incomplete query/page data and is never automatically accepted as a tolerance baseline.
- Bad, corrupted, conflicting or ambiguous source data cannot produce an unqualified training-policy pass.
- A Sunday-night workout assigned to a Monday UTC timestamp still belongs to the previous Denver calendar day.
- A cross-midnight activity is identified for review rather than allocated entirely to one day without a warning.
- A combined-time overage is shown even when separate running and cycling constraints are below ceiling.
- Tests, mobile and planner typechecks pass in GitHub Actions before review.
- Device QA, source reconciliation review and backup/restore remain required before merge/release.

## Still outside scope

1. Definitive completed TrainingPeaks/Garmin ingestion and independent provider coverage verification.
2. Source-match **editing UI** for manually assigning duplicate external completed sessions when platform IDs differ.
3. Actual daily split of cross-midnight training using detailed moving-time intervals.
4. Automatic workout rebalancing, change approval, and end-to-end device/backup testing.
5. Any unvalidated personalized pTSS risk score or virtual PT treatment prescription.

**Next suggested engineering slice:** manual source reconciliation with an audit trail and a proposed-plan change preview that requires explicit athlete acceptance before any existing workout is modified.