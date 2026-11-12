// Read-only, privacy-preserving inspection of a SINGLE SQLite database file.
// This cannot prove who owns an unmarked legacy database and never migrates.
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const input = process.argv[2];
if (!input) {
  process.stderr.write('Usage: node audit-legacy-owner.mjs /path/to/synthetic.db\n');
  process.exit(2);
}
const path = resolve(input);
if (!existsSync(path) || !statSync(path).isFile()) {
  process.stderr.write('Database file unavailable; refusing to create or claim it.\n');
  process.exit(2);
}
const expectedOwner = process.env.SIDEQUEST_QA_EXPECTED_OWNER_ID ?? null;
let db;
try {
  db = new DatabaseSync(path, { readOnly: true });
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  ).all().map((row) => String(row.name));
  const ownerTable = tables.includes('sidequest_athlete_database_owner');
  const owner = ownerTable ? db.prepare(
    'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton = 1',
  ).get()?.user_id : null;
  const quickCheck = db.prepare('PRAGMA quick_check').all();
  const integrityOk = quickCheck.length === 1 && quickCheck[0].quick_check === 'ok';
  const userTablesExist = tables.some((name) => name !== 'sidequest_athlete_database_owner');
  const ownerStatus = owner
    ? (expectedOwner === null ? 'OWNER_NOT_CHECKED'
      : owner === expectedOwner ? 'VERIFIED_OWNER' : 'OWNER_MISMATCH')
    : userTablesExist ? 'LEGACY_OWNER_UNVERIFIED' : 'EMPTY_UNCLAIMED';
  // Never emit athlete IDs, training rows, personal metadata or raw SQL.
  const report = {
    schemaVersion: 1,
    mode: 'read_only_no_migration',
    ownerStatus,
    integrityOk,
    userTablesExist,
    walPresent: existsSync(path + '-wal'),
    shmPresent: existsSync(path + '-shm'),
    note: 'Do not assign ownership from this report. Legacy migration requires independently verified provenance and a consistent backup.',
  };
  process.stdout.write(JSON.stringify(report) + '\n');
  if (!integrityOk || ownerStatus !== 'VERIFIED_OWNER') process.exitCode = 2;
} catch {
  process.stderr.write('Read-only SQLite inspection failed; original bytes were not intentionally changed.\n');
  process.exitCode = 2;
} finally {
  db?.close();
}
