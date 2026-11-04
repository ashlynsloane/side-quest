# Athlete SQLite ownership: migration and release gate

**Status:** pre-release engineering procedure; no migration of actual athlete data has been executed. See issue #15. The implementation is on draft PR #12.

## Why this gate exists

Historically, Side Quest named secondary athlete SQLite files with a sanitized user ID (nonalphanumeric characters became underscores, and names were truncated). Distinct athletes can therefore map to an identical filename. A localStorage-only filename ownership claim can also be lost while the SQLite file remains.

The QA implementation now stores `user_id` in each SQLite file in `sidequest_athlete_database_owner` (one `singleton=1` row) and verifies it **before initializing or exposing athlete records**. A mismatched in-file user ID is always rejected, regardless of what the filename or localStorage says.

## Fail-closed cases

- **New file, no prior application tables:** assign the authenticated athlete in SQLite, initialize its tables, and only then save the local filename claim.
- **Previously verified file:** accept only the matching internal user ID.
- **Populated original `circuit-generator.db`, no internal owner yet:** adopt only when `circuit.original-database-owner` already identifies the current authenticated athlete; otherwise preserve the file and refuse automatic adoption.
- **Populated secondary DB, no internal owner yet:** adopt only with an existing matching `circuit.database-file-owner.v1:<filename>` claim. Otherwise preserve it and refuse automatic attribution.
- **SQLite owner mismatch:** reject even if localStorage claims a match.
- **Failure during verification or initialization:** do not change the active profile or checkpoint identity.
- **Unowned and ambiguous legacy DB:** do not create a new mapping to it based only on the sanitized filename.

These are conservative checks, **not proof** that all files created before the ownership marker have a correct owner.

## Procedure for an eventual legacy migration

1. Stop writers. Back up all application databases *together with their corresponding WAL and SHM files* or use a consistent SQLite backup API. Never edit only a live `.db` file.
2. Generate a read-only manifest: file name, SQL schema version, internal owner marker (if any), original-owner claim and secondary-file claim; exclude workout details, private profile fields and credentials.
3. Confirm the owner from independently trustworthy account provenance, not just a filename or an email string embedded in a file.
4. For ambiguous or conflicting ownership, keep the original data untouched and require explicit owner verification; do not silently create a new blank profile or delete ambiguous records.
5. Stage a copy. Insert the in-file owner marker transactionally, then validate database integrity and compare table counts/checksums before and after. Keep a rollback artifact.
6. After migration, run synthetic cross-profile switches, cold restart, localStorage reset, conflicting IDs, interrupted migration and verified restore.
7. Only after native verification and an explicit release decision should the migration be enabled for actual beta installations.

## Test evidence and remaining limitations

`packages/planner/test/actual-mobile-workout-sqlite.test.ts` exercises the actual mobile database service through disk-backed Node SQLite: collision allocation, original and secondary owner markers, forged local ownership, lost localStorage provenance, ambiguous legacy refusal and failed activation. Passing these tests is not a substitute for Expo SQLite testing on a real iOS simulator.

For release, add a native migration recovery screen with explicit export/back-up options, a non-destructive downgrade path, and verified migration telemetry that does not include personal workout records.

**Never run ad hoc SQL or destructive manual migration against the installed beta.**
