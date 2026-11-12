// Synthetic SQLite restore/recovery rehearsal ONLY. Not a real-data migration.
// Require an independently supplied synthetic owner and never overwrite any
// existing destination or write back into the original snapshot.
import { backup, DatabaseSync } from 'node:sqlite';
import { existsSync, linkSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

async function main() {
  if (process.env.SIDEQUEST_QA_SYNTHETIC_RESTORE !== '1') {
    throw new Error('Explicit synthetic restore QA authorization required.');
  }
  if (process.argv.length !== 4) {
    throw new Error('Expected synthetic-source.db synthetic-restored.db.');
  }
  const expectedOwner = process.env.SIDEQUEST_QA_EXPECTED_OWNER_ID ?? '';
  if (!/^synthetic-[a-z0-9-]+$/.test(expectedOwner)) {
    throw new Error('A separate synthetic-only owner proof is required.');
  }
  const input = resolve(process.argv[2]);
  const output = resolve(process.argv[3]);
  if (input === output || !input.endsWith('.db') || !output.endsWith('.db')) {
    throw new Error('Distinct .db files are required.');
  }
  if (!basename(input).includes('synthetic') || !basename(output).includes('synthetic')) {
    throw new Error('Refusing filenames that are not explicitly synthetic fixtures.');
  }
  if (!existsSync(input) || !statSync(input).isFile()) {
    throw new Error('Synthetic backup source must already exist.');
  }
  if (existsSync(output) || !existsSync(dirname(output))) {
    throw new Error('Existing or missing output destination; refusing any overwrite.');
  }
  const temp = output.slice(0, -3) + '.synthetic-restore-incomplete-' + randomUUID() + '.db';
  let source;
  try {
    source = new DatabaseSync(input, { readOnly: true });
    const integrity = source.prepare('PRAGMA quick_check').all();
    if (integrity.length !== 1 || integrity[0].quick_check !== 'ok') {
      throw new Error('Source integrity could not be verified.');
    }
    const ownerExists = source.prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='sidequest_athlete_database_owner'",
    ).get()?.n === 1;
    if (!ownerExists) throw new Error('Synthetic snapshot has no verified owner marker.');
    const owner = source.prepare(
      'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton=1',
    ).get()?.user_id;
    if (owner !== expectedOwner) {
      throw new Error('Independently supplied synthetic owner does not match the snapshot.');
    }
    // SQLite online backup is safe for a snapshot still using WAL. Opening
    // and copying via a raw file read risks losing committed WAL records.
    await backup(source, temp);
    const restored = new DatabaseSync(temp, { readOnly: true });
    try {
      const result = restored.prepare('PRAGMA quick_check').all();
      if (result.length !== 1 || result[0].quick_check !== 'ok') {
        throw new Error('Restored database integrity failed.');
      }
      const restoredOwner = restored.prepare(
        'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton=1',
      ).get()?.user_id;
      if (restoredOwner !== expectedOwner) {
        throw new Error('Restored owner marker changed.');
      }
      for (const name of ['completed_workouts', 'workout_ledger', 'training_blocks']) {
        const exists = source.prepare(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?",
        ).get(name)?.n === 1;
        if (!exists) continue;
        const table = '"' + name + '"';
        const originalCount = source.prepare('SELECT COUNT(*) AS n FROM ' + table).get()?.n;
        const restoredCount = restored.prepare('SELECT COUNT(*) AS n FROM ' + table).get()?.n;
        if (originalCount !== restoredCount) throw new Error('Restored row counts differ.');
      }
    } finally {
      restored.close();
    }
    // Atomic no-overwrite publication, including a last-moment race where a
    // second process creates the destination after the existence precheck.
    linkSync(temp, output);
    process.stdout.write(JSON.stringify({
      mode: 'synthetic_only_restore_rehearsal',
      ownerVerified: true,
      integrityOk: true,
      restoredToNewFile: true,
      migratedRealAthleteData: false,
      note: 'Synthetic restore only. Real owner provenance, device migration, and rollback require separate approval.',
    }) + '\n');
  } finally {
    source?.close();
    if (existsSync(temp)) rmSync(temp, { force: true });
  }
}
main().catch(() => {
  // No paths, owner values, training records or raw database errors in logs.
  process.stderr.write('Synthetic restore refused or failed. No existing database overwritten.\n');
  process.exitCode = 2;
});
