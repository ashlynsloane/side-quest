# Generalized Injury Management V1 (isolated prototype)

**Status:** Implemented as a pure TypeScript planner module, with Vitest cases. **Not connected to the mobile app or its database; not medically validated.** No existing user records or phone build were changed.

## Scope

- Separate durable injury cases from acute events and recurrent episodes.
- Keep postoperative, traumatic, gradual onset, and persistent conditions as independent states.
- Support multiple simultaneous injuries, active clinical restrictions, delayed symptom responses, and diagnosis changes.
- Do not assume pain-free status or favorable overall readiness implies clinical clearance.
- Enable unaffected-region strength to remain eligible **only** when exercise exposure metadata has been reviewed.

## API

See `packages/planner/src/injury-management.ts`: `triageInjuryEvents`, `effectiveConstraints`, `assessInjuryManagement`, `screenExerciseForInjuries`, and `suggestInjuryEventLink`.

`progression_candidate` means a protocol-specific clinician-reviewed program *may* evaluate an increase; it is never authorization for the general workout generator to independently progress rehabilitation loading.

`eligible_for_strength_selection` means only that the coded exclusions did not detect a conflict. It is **not** medical clearance.

## Safety notes and known limitations

- High-concern triage signs are illustrative and do not replace emergency assessment. The thresholds, screening phrasing, and exercise metadata require clinical review.
- Unknown exercise loading, uncertain injury location, and unverified dose caps require manual review.
- A clinician-imposed restriction remains active until explicitly revoked or superseded, even after its review or expiry date.
- The core does not yet support measurement-specific caps, clinical protocol dosing, database persistence, or interventional progression. All remain integration work.
- No automation should silently apply a clinical restriction removal based on a questionnaire response.
- Individual test results establish deterministic program behavior only, not prediction or medical safety.

## Next milestones

1. Add an idempotent SQLite migration with injury cases, events, episodes, observations, restrictions, protocol assignments, and decision audit.
2. Implement local export and restore tests **before** migrating a real user's phone data.
3. Connect new injury intake and daily check-ins, never overwriting persistent restrictions.
4. Apply constraint screening before workout generation, on swaps, and on workout start; preserve exercise intent for unaffected training.
5. Integrate clinician-authored protocol dose ranges and later standardized outcomes.
6. Run `pnpm check` plus on-device end-to-end tests and obtain clinical review before enabling autonomous clinical progression.

This branch intentionally remains separate from `sq2-experience-rebuild`.
