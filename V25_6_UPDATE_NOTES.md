# V25.6 — Long-Term Adaptation Modeling

This note documents the existing V25.6 implementation in the repository. It was missing from the historic validation script and is restored here as a reference, **not** as a new clinical validation claim.

## Implemented behavior

- `packages/planner/src/long-term-adaptation.ts` defines `trackLongTermAdaptation`, which estimates objective-specific adaptation trajectories and projections.
- Model inputs are repeated `AdaptationEvidencePoint` observations, including adaptation load, completion ratio, response quality and timestamp.
- Objective-specific half-life defaults decay older signals exponentially. The model bounds estimates to 0–100 and returns estimated change and confidence.
- Confidence is derived from the number of evidence points and span of observations: one or a few workouts cannot produce a high-confidence trend.
- Forecasts for the configured horizons estimate retention **without new stimulus**, not achieved fitness or clinical recovery.
- `apps/mobile/src/services/long-term-adaptation.ts` transforms the trajectories into human-readable summary cards and labels evidence confidence.

## Important limitations

These numbers are planning heuristics. The default half-lives, gain scaling, forecast decay and maintenance-exposure indicators are not validated physiological measurements. A modeled increase does **not** justify bypassing Side Quest's medical restrictions, daily training ceilings, post-exposure recovery checks or previously prescribed ramp limits.

## Verification

`packages/planner/test/long-term-adaptation.test.ts` covers model behavior and non-diagnostic safeguards. Run `pnpm --dir packages/planner test` and `pnpm --dir packages/planner typecheck`. Product integration also requires the separate daily-training-guardrails and actual training-event tests before any fitness estimate could affect an exercise prescription.
