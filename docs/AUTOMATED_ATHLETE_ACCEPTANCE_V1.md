# Side Quest synthetic athlete acceptance — Phase 1

This branch is stacked on PR #11. It does not alter production, actual athlete data, or the installed beta.

## Added in this phase
- Table-driven synthetic athlete provenance tests: beginner, experienced, observed, return-to-run, incomplete coverage and restricted-run context.
- Deterministic seven-day proposed-week validation: generated multisport sessions, unknown duration, external calendar exclusion, and week boundaries.
- Completed endurance invariants: source identity, missing distance, invalid durations, impossible dates, deterministic records.
- Separate GitHub Actions acceptance gate with typechecks, dedicated matrix, full planner regressions, iOS JS export and downloadable JUnit results.

## Important boundaries
These tests exercise planner-domain functions using synthetic scenarios. They do **not** automate real React Native taps, real iOS SQLite migrations, force-quit / relaunch, native backups, source-provider API completeness, or visual regression. The iOS export is not a simulator launch. No clinical or pTSS effectiveness claims are made.

## Next phases
1. Implement a full route-to-ledger integration harness with injected persistence failures and profile switching, using real app adapters and disk-backed SQLite.
2. Expand property-based generated scenarios and invariants (including plan decisions and rolling load windows).
3. Add macOS iOS simulator workflow, deterministic fixture injection, accessibility and screenshot tests.
4. Gate release on genuine simulator observations and coverage, not solely on this phase-1 suite.

To run locally:
```bash
pnpm install --frozen-lockfile
pnpm --dir packages/planner exec vitest run test/automated-athlete-acceptance.test.ts
pnpm --dir packages/planner test
```
