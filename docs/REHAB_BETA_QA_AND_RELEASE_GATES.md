# Side Quest Rehabilitation Beta — Integration QA and Release Gates

## Status
**Draft PR #2 only.** No production build, phone database, cloud backend, or clinician protocol was modified. This version is an opt-in longitudinal logging and safety-preflight beta, **not** a clinical rehabilitation prescriber.

## What is implemented
- Generalized injury case, episode/event, observation, restriction, and protocol records.
- Profile-scoped SQLite local injury database (additive; legacy data untouched).
- Automatic verified **local snapshot backup before first injury schema initialization**.
- Sandbox **logical restore test** of that backup, SQLite integrity check, and per-table row-count comparison; never overwrites the active athlete database.
- Backup manifest retained in local key-value storage so the saved database filename can be recovered after startup.
- Atomic schema creation and failure rollback; per-open-profile initialization serialization.
- New injury intake with reported onset mechanism and unknown diagnosis state.
- Daily longitudinal pain (task-specific), 24-hour response, function trend, and optional morning stiffness.
- Explicit new flare, trauma, new-symptom, and clinical-event logging for an existing case.
- Injury-scoped trend graphics and timeline; user-initiated text PT summary through native Share sheet.
- Opt-in inclusion of unrelated training history in PT summary. Existing Side Quest workout ledger is reused; no invented exercise history.
- Read-only generated-workout preflight; unreviewed exercises and unclassified injury regions fail conservative review. No clinical auto-approval.

## Enable only for controlled local QA
The new screen is guarded by:
\`EXPO_PUBLIC_ENABLE_REHAB_BETA=true\`

Leave unset or false on the normal phone build. After changing Expo public environment values in a local development build, restart the Metro dev server.

The feature is accessible from the existing Readiness screen (and a visible read-only warning on Today). Opening the beta causes first-time injury schema initialization *only when the flag is enabled*.

## Critical release gates (ALL required before production enablement)
1. **Backups:** verify backup manifest persists, backup file is present, restored sandbox passes integrity and row counts, and at least one full real-device recovery into a disposable installed test app succeeds.
2. **Profile isolation:** create data under two distinct local beta profiles. Verify neither reads the other's cases, observations, constraints, or backup manifests. Verify switching back restores the correct profile.
3. **Migration and downgrade:** confirm the first migration never deletes or changes old workout, readiness, or PT profile records. Test interruption mid-migration, retry, and opening an older installed build where feasible.
4. **App lifecycle:** start a new case and daily check-in, force-close and reopen, verify exact saved timestamps, pain tasks, notes, and clinician restrictions.
5. **Missingness:** no symptom entry is zero; no absent workout is interpreted as rest. Compare rest pain separately from walking or task-specific pain.
6. **Multiple injury cases:** log two cases and one shared exposure. Verify report cross-case isolation and conservative combined restrictions.
7. **New trauma:** ensure a new injury with significant red flags is never diagnosed or cleared by the app. Test both clinician referral messaging and preflight hold.
8. **Flare/diagnosis revision:** preserve all historical events; never erase prior symptom trajectories when condition labels or clinical restrictions change.
9. **Workout preflight:** new unreviewed cases block beta Today workout start. Validate no uncategorized exercise is silently considered cleared. Test existing legacy generator separately for regressions.
10. **Export privacy:** share sheet opens only after explicit athlete action; verify selected injury/date range, training opt-in, unit/context labels, provenance, and excluded unrelated data.
11. **Accessibility:** large touch targets, screen-reader labels, contrast, numeric pain scale, and usable scrolling on supported iOS/Android devices.
12. **Clinical review:** obtain condition-appropriate professional review of any diagnosis-specific protocol and clinical warning/clearance rules before enabling automatic treatment progression.

## Known limitations
- The current beta keeps clinical rehab records **separate** from the existing temporary \`training_check_ins\` adjustment pipeline. Clinician-defined restrictions entered into the historical case store will not automatically alter the existing generated plan; the preflight is a separate read-only check.
- Daily check-in lacks independent timestamps for overnight symptom change vs current recording; later iterations should permit time-of-day and missed-day handling.
- The read-only preflight purposely has **zero** reviewed exercise IDs at first. Thus a user with an active case cannot assume an existing workout is clinically cleared.
- The report uses a simple mobile bar visualization and a native text share sheet, not a finished PDF or clinician portal.
- Patient-reported onset, improvement, or setback is not proof of causation from any prior exercise.
- There is no automatic sync to Supabase, no therapist access, and no verified physical therapy protocol import.
- Database backups are local to the app sandbox, not an off-device disaster recovery solution. Device loss or app deletion could still erase both original and backup. A user-consented off-device backup and retention policy are required before relying on this for critical health history.
- Current backup check uses SQLite's online backup API, not a manually copied WAL-mode file.
- In-memory SQLite test success and TypeScript compilation do **not** replace actual mobile device validation.
- New injury records keep affected anatomical regions unclassified until clinically reviewed rather than interpreting arbitrary free text as a safe exercise code.
- Existing local restriction updates keep an up-to-date row, but a future immutable constraint-change audit should be added before clinician collaboration.

## Test commands
\`\`\`sh
pnpm install --frozen-lockfile
pnpm --dir packages/planner test
pnpm typecheck
pnpm validate:exercises
pnpm validate:media
pnpm test
\`\`\`

The feature branch runs these checks automatically in \`.github/workflows/rehab-validation.yml\` and is not to be merged while any fail.

## Deferred next milestone
- Device backup-and-restore QA.
- Separate, clinician-reviewable protocol registry and structured exercise-loading metadata review.
- Binding verified clinician instructions to dosage decisions and approved substitutions.
- Richer time-series plots with dated axes and missingness marks, and a user-selected PDF plus CSV/JSON bundle.
- Off-device export/restore strategy under explicit patient control; no default cloud upload.
