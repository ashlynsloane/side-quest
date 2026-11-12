// QA ONLY: transactionally consistent snapshot of an explicitly synthetic
// legacy SQLite fixture. Not an app migration and never intended for an
// athlete's personal database or an installed iPhone container.
import { backup, DatabaseSync } from 'node:sqlite';
import { existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

async function main() {
  if (process.env.SIDEQUEST_QA_SYNTHETIC_BACKUP !== '1') {
    throw new Error('Synthetic backup requires explicit SIDEQUEST_QA_SYNTHETIC_BACKUP=1.');
  }
  if (process.argv.length !== 4) {
    throw new Error('Usage: node backup-synthetic-legacy-sqlite.mjs synthetic-input.db synthetic-output.db');
  }
  const input = resolve(process.argv[2]);
  const output = resolve(process.argv[3]);
  // The CLI deliberately cannot be used as a generic device-data export.
  if (!basename(input).includes('synthetic') || !basename(output).includes('synthetic')) {
    throw new Error('Only explicitly synthetic fixture filenames are supported.');
  }
  if (!input.endsWith('.db') || !output.endsWith('.db') || input === output) {
    throw new Error('Input and output must be distinct synthetic .db files.');
  }
  if (!existsSync(input) || !statSync(input).isFile()) {
    throw new Error('Synthetic source must exist; refusing to create an empty database.');
  }
  if (existsSync(output)) throw new Error('Backup destination already exists; no overwrite allowed.');
  if (!existsSync(dirname(output))) throw new Error('Backup destination directory is missing.');

  const temp = output.slice(0, -3) + '.synthetic-incomplete-' + randomUUID() + '.db';
  let source;
  try {
    source = new DatabaseSync(input, { readOnly: true });
    // sqlite.backup uses SQLite's online backup API. Reading through this
    // SQLite handle includes committed WAL entries; copying a .db file alone
    // could silently omit them. No source schema change or owner assignment.
    await backup(source, temp);
    const cloned = new DatabaseSync(temp, { readOnly: true });
    try {
      const result = cloned.prepare('PRAGMA quick_check').all();
      if (result.length !== 1 || result[0].quick_check !== 'ok') {
        throw new Error('Snapshot integrity check failed.');
      }
    } finally {
      cloned.close();
    }
    // Publish a validated snapshot atomically. The original remains intact.
    if (existsSync(output)) throw new Error('Backup destination appeared during copy.');
    renameSync(temp, output);
    process.stdout.write(JSON.stringify({
      mode: 'synthetic_only_online_sqlite_backup',
      integrityOk: true,
      migrated: false,
      ownerVerified: false,
      note: 'No ownership inference, athlete data access, or production migration.',
    }) + '\n');
  } finally {
    source?.close();
    if (existsSync(temp)) rmSync(temp, { force: true });
  }
}

main().catch(() => {
  // Do not print input paths, owner IDs or stored records in diagnostic logs.
  process.stderr.write('Synthetic backup denied or failed. No migration performed.\n');
  process.exitCode = 2;
});
