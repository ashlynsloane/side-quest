# Side Quest: Longitudinal Rehabilitation Memory and PT Reports (V1)

**Status:** architecture and deterministic report-data builder committed on the isolated feature branch. No UI, database migration, automatic exports, PDF renderer, or clinician approval workflow is implemented yet.

## Product objective

Create a personal rehabilitation decision-support record that can answer:
1. What changed in health and function, and when?
2. What was prescribed, performed, skipped, or substituted?
3. How did symptoms and function respond over the next 24–48 hours?
4. Which information was self-reported, measured by a device, entered by a PT, or calculated?
5. What clinically relevant uncertainties or restrictions remain unresolved?

The data should be useful both for daily adaptive strength programming and for a **person-approved** visit summary shared with a physical therapist.

## Source of truth and existing code

- Existing on-device SQLite \`apps/mobile/src/services/database.ts\` stores \`workout_ledger\`, \`exercise_performance_history\`, \`workout_reflections\`, \`readiness_check_ins\`, \`training_check_ins\`, \`pt_profiles\`, and \`endurance_activities\`.
- Existing \`apps/mobile/src/services/training-history.ts\` reads completed strength sessions and endurance activities from the ledger, reconciling some linked sensor activities to avoid double counting.
- Current \`training_check_ins\` is a **temporary active-adjustment** representation. It must not be the only permanent longitudinal symptom record.
- \`packages/planner/src/injury-management.ts\` defines independent injury cases, episodes, events, restrictions, authorizations, and safety decisions. It is not yet wired to SQLite.
- **New** \`packages/planner/src/rehab-progress-report.ts\` produces a deterministic, condition-scoped JSON structure that future chart renderers and exporters can consume. It does not read SQLite or silently join records.

## Longitudinal records to add (additive SQLite migration, planned)

| Table | Key fields | Notes |
| --- | --- | --- |
| \`injury_cases\` | id, course, status, diagnosis_state, created_at, updated_at | One durable clinical concern; never identified only by body region |
| \`injury_events\` | id, case_id nullable, event_type, mechanism, occurred_at, source, payload_json | New trauma, onset, flare, clinical update, diagnosis revision |
| \`injury_episodes\` | id, case_id, started_at, ended_at nullable, phase, payload_json | Multiple recurrent episodes per case |
| \`injury_observations\` | id, case_id, observed_at, measure_key, unit, context_key, value, source, source_id | Append-only measures; include functional tasks, not just pain |
| \`injury_restrictions\` | id, case_id nullable, origin, status, issued_at, review_by, rule_json | Clinician-origin limits persist until explicitly revoked |
| \`rehab_protocol_assignments\` | id, case_id, protocol_id, version, clinician_approved, dates, payload_json | Record provenance and authorization; avoid silent protocol changes |
| \`injury_decision_audit\` | id, case_id, generated_at, ruleset_version, inputs_hash, result_json, override_reason | Explain every modified training recommendation |
| \`injury_training_links\` | id, case_id, ledger_workout_id/external_activity_id, relationship, source | Explicit association only; correlation not causation |

Use an immutable observation/event history and explicit revision or supersession records, rather than overwriting the past. Include stable IDs and local-date/timezone information for daily charts. Protect earlier data with a verified backup-and-restore path before any schema migration on a real device.

## PT export — envisioned sections

1. **Clinical context:** date range, selected injury cases, diagnosis status, current clinician restrictions, currently assigned protocol, patient goals.
2. **Event timeline:** onset, flares, diagnostic changes, visits, missed training, new restrictions. Mark events as *reported* or *clinically documented*; never claim an event caused a symptom change solely due to proximity.
3. **Symptom and function trajectories:** dated pain by defined task/context, stiffness duration, patient-specific function measures, objective capacity tests when applicable, with observation-count labels. Missing observations remain gaps.
4. **Training exposure:** performed exercises, reps, loads and units, rehabilitation adherence only where a prescription exists, related cycling/running/swimming exposure when explicitly included.
5. **Protocol history:** progression/hold/reduction decisions, rule version, reported adverse responses, outstanding clinical questions.
6. **Data provenance and limitations:** self-report vs device vs clinician, coverage, excluded records, missingness, corrections.
7. **User-controlled attachments:** raw CSV/JSON supporting figures; future optional PDF print report.

## Chart design constraints

- Separate datasets by **injury case, metric definition, measurement context, and unit**.
- Never treat an unlogged training day as rest; never treat a missed pain check-in as zero pain.
- Show raw observations or clearly labeled rolling summaries; label n and missingness.
- Mark interventions and setbacks as annotations, not proven causes of subsequent changes.
- Use original strength loads and repetitions where available. Do not infer 1RM or equate endurance TSS with strength dosage by default.
- Record known changes in how a metric was measured so trends can be split or marked noncomparable.
- Include baselines and progress toward patient-defined goals when the associated metric was measured consistently.

## Privacy and access

- Data stays local by default; no auto-sharing to a PT, social feature, or analytics service.
- Explicit patient selection of case, date window, optional unrelated training, and redacted notes precedes export.
- Future cloud/clinician portal must include identity-based access control, auditing, secure transport, retention/deletion, and privacy/legal review before it is offered as a service.
- The pure report builder does not transmit data, make diagnosis claims, or interpret treatment effects.

## Suggested implementation sequence

1. **Build a backup/restore test harness** for existing SQLite data; inventory migrations and confirm user's installed build.
2. **Add additive SQLite injury-event/observation tables** and a versioned repository interface with migrations and rollback/recovery plan.
3. Connect daily brief checks and event-triggered injury intake to the records; keep current \`training_check_ins\` for short-term restrictions until migrated.
4. Connect exercise sessions/loads to injury cases only with explicit athlete confirmation or clinician-authored protocol associations.
5. Use \`buildRehabReportData\` as the chart data contract and produce a local on-device progress dashboard.
6. Add **user-initiated PT report export** with scoped PDF + machine-readable data, then usability review with a PT.
7. Only then consider secure cloud sync, PT messaging, or a clinician portal.

## Scope of current code

- \`buildRehabReportData\` takes already-fetched, explicitly supplied records; selects a case and time window; groups compatible metrics; provides raw chart points and observed deltas; includes explicitly associated workouts and opt-in unlinked training.
- Vitest cases specify isolation of injuries, chronological order, unit/context separation, no data imputation, explicit training-inclusion choice, malformed inputs, and empty coverage.
- **Tests added but not executed against the full repository in this environment.** No changes to the default branch, existing app UI, local database, or personal records.
