# Side Quest Milestone 1 — signed iPhone acceptance protocol (NOT EXECUTED)

**Status:** No device signoff. This is a checklist for a later authorized, **synthetic-data-only** beta review. Do not mistake a passing simulator run or source CI for any physical-device outcome.

## Test preconditions

- The release candidate is a traceable, signed **isolated QA build**, with the exact git SHA, asset fingerprint, bundle ID, build number and provisioning environment recorded.
- Use a dedicated test iPhone with NO actual athlete history, no real Apple Health/Strava/Garmin account, no production auth credentials, and no production Supabase configuration.
- Confirm local-first mode with cloud/social flags OFF. Leave the existing installed beta on any real user's device untouched.
- Record tester initials, iPhone model, iOS version, installation method, QA build SHA, local timezone and each test date. Collect only synthetic screenshots/logs; redact identifiers if unexpectedly present.
- For every failure, archive the *first* failure's screenshot and log. Restart tests on a clean test profile; do not delete real app documents to force success.

## Physical-device scenarios (each requires separate observed evidence)

| ID | Native scenario | Required observation | Status |
| --- | --- | --- | --- |
| P01 | Clean install and local synthetic account A | Profile persists; no blocking error; no real data or network auth required | NOT RUN |
| P02 | A completes first-week setup | Generated seven-day proposed week and its provenance are visible; no invented measured capacity | NOT RUN |
| P03 | A saves a manually recorded 75-minute ride | Exactly one local completed endurance activity with measured duration and explicit source | NOT RUN |
| P04 | Force quit and relaunch after P03 | Same ride, identity, date and duration; no duplicate; offline also succeeds | NOT RUN |
| P05 | A starts strength, completes first station, taps Leave | Durable checkpoint exists before leaving; timer no longer advances in background | NOT RUN |
| P06 | Force quit from home and cold relaunch | A's correct station, rounds, rest state and paused timer restore | NOT RUN |
| P07 | Resume and Save partial | Canonical history shows the original nonzero fraction below 100%; unlogged sets are NOT invented | NOT RUN |
| P08 | Kill immediately after Save partial during a QA-controlled pending/SQL interruption | Pending fraction/timestamp recover, exactly one canonical record after retry, no full-dose inflation | NOT RUN |
| P09 | Sign out A and create local B | Neither A's completed records nor A's active strength session appear in B | NOT RUN |
| P10 | Pause an independent B strength session, switch back A→B | Each athlete's own paused workout and plan link restore; no data overwrite | NOT RUN |
| P11 | Switch A→B during controlled first-week generation/persistence | Stale A writes and UI results cannot appear in B; A retry targets same plan identity | NOT RUN |
| P12 | Offline app relaunch / interrupted IO | Last durable records remain recoverable; user sees explicit retry, not false success | NOT RUN |
| P13 | Reduced-motion, large text, VoiceOver basic navigation | No unlabeled core controls; history completion percentage is spoken correctly and remains tappable | NOT RUN |
| P14 | Full reset/migration rehearsal on COPY of synthetic legacy SQLite with missing owner | Fail closed, preserve original bytes and journaling sidecars, no silent adoption or loss | NOT RUN |
| P15 | Production-safety and privacy inspection | No QA fault-injection toggles or synthetic test identity used in production builds; no API credentials or real user contents in diagnostic artifacts | NOT RUN |

**Pass rule:** each scenario requires a named build hash, observed result, and signed evidence. `NOT RUN`, `SKIPPED`, a screenshot from the wrong build, or an old standalone test do not qualify. Do not turn these into automated PASS on file existence alone.

## High-risk profile recovery protocol

The legacy SQLite owner problem is fundamentally a provenance question; synthetic tests cannot tell which human owns an ambiguous real historical file.

1. **Do not auto-adopt or overwrite a populated database without an owner row.** Filename normalization and leftover localStorage metadata are not sufficient proof.
2. Preserve the original app container and any related SQLite `-wal`/`-shm` files. For an approved recovery, make a *transactionally consistent* SQLite snapshot/copy using an appropriate native backup mechanism before attempting any schema or ownership change. Copying only the `.db` file while WAL contains committed records is not safe.
3. Audit file identity/owner-marker presence without exposing names, emails, raw training data or API tokens in CI logs.
4. Rehearse ownership verification and rollback on a COPY of synthetic data, including two colliding normalized profile IDs, missing localStorage, interrupted migration and mismatched embedded owner. Never infer original ownership by recency or first sign-in.
5. Only after provenance is independently established and a restorable backup is verified may an explicitly authorized one-time migration be considered. Otherwise leave the original bytes untouched and show a recovery error, not an infinite spinner.

## Evidence and release decision

- **Source QA:** require exact-head planner/mobile typechecks, real-file SQLite regression and iOS export; [CI history](https://github.com/ashlynsloane/side-quest/actions).
- **Native simulator:** require all six integrated stages from one full Release run with valid JUnit and screenshots. A focused scope does not substitute.
- **Independent account-isolation:** `live-isolation` native scope must establish A→B→A→B recovery of the two live strength checkpoints.
- **Physical device:** fill P01–P15 with evidence and record explicit owner authorization before production data migration or beta deployment.
- **Launch decision:** keep [PR #12](https://github.com/ashlynsloane/side-quest/pull/12) DRAFT and cloud [PR #20](https://github.com/ashlynsloane/side-quest/pull/20) OFF until each applicable gate passes. Document any scenario deliberately deferred as a release blocker rather than hiding it.

All rows above intentionally begin **NOT RUN**. This document itself proves no runtime acceptance.
