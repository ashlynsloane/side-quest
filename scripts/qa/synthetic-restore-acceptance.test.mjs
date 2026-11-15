// Standalone synthetic-only SQLite recovery acceptance using Node 22's SQLite.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const backupScript = fileURLToPath(new URL('./backup-synthetic-legacy-sqlite.mjs', import.meta.url));
const checksum = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const restoreScript = fileURLToPath(new URL('./restore-synthetic-legacy-sqlite.mjs', import.meta.url));

function execute(script, args, env) {
  return spawnSync(process.execPath, [script, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 15000,
  });
}

test('synthetic backup and restore preserve every table and schema version', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sidequest-synthetic-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const input = join(dir, 'synthetic-original.db');
  const snapshot = join(dir, 'synthetic-backup.db');
  const restored = join(dir, 'synthetic-restored.db');
  const db = new DatabaseSync(input);
  try {
    db.exec(`PRAGMA user_version = 7;
      PRAGMA application_id = 12345;
      CREATE TABLE sidequest_athlete_database_owner(singleton INTEGER PRIMARY KEY, user_id TEXT NOT NULL);
      INSERT INTO sidequest_athlete_database_owner VALUES (1, 'synthetic-athlete-a');
      CREATE TABLE training_blocks(id TEXT PRIMARY KEY);
      INSERT INTO training_blocks VALUES ('week-a');
      CREATE TABLE athlete_plan_notes(id INTEGER PRIMARY KEY, text TEXT);
      INSERT INTO athlete_plan_notes VALUES (1, 'fixture-only');
      CREATE TABLE synthetic_blob_metadata(id INTEGER PRIMARY KEY AUTOINCREMENT, raw BLOB, note TEXT);
      CREATE INDEX idx_notes_text ON athlete_plan_notes(text);
      CREATE VIEW synthetic_notes_view AS SELECT id, text FROM athlete_plan_notes;
      INSERT INTO synthetic_blob_metadata VALUES (1, x'00FF10', 'binary-fixture');
    `);
  } finally {
    db.close();
  }
  const originalHash = checksum(input);
  const backup = execute(backupScript, [input, snapshot], {
    SIDEQUEST_QA_SYNTHETIC_BACKUP: '1',
  });
  assert.equal(backup.status, 0, backup.stderr);
  assert.equal(checksum(input), originalHash, 'Original SQLite bytes changed during backup');
  const snapshotHash = checksum(snapshot);
  const restore = execute(restoreScript, [snapshot, restored], {
    SIDEQUEST_QA_SYNTHETIC_RESTORE: '1',
    SIDEQUEST_QA_EXPECTED_OWNER_ID: 'synthetic-athlete-a',
  });
  assert.equal(restore.status, 0, restore.stderr);
  assert.equal(checksum(snapshot), snapshotHash, 'Backup bytes changed during restore');
  assert.equal(JSON.parse(restore.stdout).restoredToNewFile, true);
  const check = new DatabaseSync(restored, { readOnly: true });
  try {
    assert.equal(check.prepare('PRAGMA user_version').get().user_version, 7);
    assert.equal(check.prepare('PRAGMA application_id').get().application_id, 12345);
    assert.equal(check.prepare("SELECT seq FROM sqlite_sequence WHERE name='synthetic_blob_metadata'").get().seq, 1);
    assert.equal(check.prepare('SELECT COUNT(*) AS n FROM athlete_plan_notes').get().n, 1);
    assert.equal(check.prepare('SELECT id FROM training_blocks').get().id, 'week-a');
    assert.deepEqual(Array.from(check.prepare('SELECT raw FROM synthetic_blob_metadata').get().raw), [0, 255, 16]);
  } finally {
    check.close();
  }

  const deniedOwner = join(dir, 'synthetic-wrong-owner.db');
  const denied = execute(restoreScript, [snapshot, deniedOwner], {
    SIDEQUEST_QA_SYNTHETIC_RESTORE: '1',
    SIDEQUEST_QA_EXPECTED_OWNER_ID: 'synthetic-athlete-b',
  });
  assert.notEqual(denied.status, 0);
  assert.equal(checksum(snapshot), snapshotHash, 'Denied owner attempt modified source');
  assert.equal(existsSync(deniedOwner), false);

  const restoredHash = checksum(restored);
  const deniedOverwrite = execute(restoreScript, [snapshot, restored], {
    SIDEQUEST_QA_SYNTHETIC_RESTORE: '1',
    SIDEQUEST_QA_EXPECTED_OWNER_ID: 'synthetic-athlete-a',
  });
  assert.notEqual(deniedOverwrite.status, 0);
  assert.equal(existsSync(restored), true);
  assert.equal(checksum(restored), restoredHash, 'Rejected overwrite altered destination');
  const unchanged = new DatabaseSync(restored, { readOnly: true });
  try {
    assert.equal(unchanged.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    assert.equal(unchanged.prepare('SELECT COUNT(*) AS n FROM athlete_plan_notes').get().n, 1);
    assert.deepEqual(Array.from(unchanged.prepare(
      'SELECT raw FROM synthetic_blob_metadata',
    ).get().raw), [0, 255, 16]);
  } finally {
    unchanged.close();
  }
});

test('backup captures committed WAL pages and leaves live synthetic source unchanged', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sidequest-synthetic-wal-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const input = join(dir, 'synthetic-live-wal.db');
  const snapshot = join(dir, 'synthetic-live-snapshot.db');
  const restored = join(dir, 'synthetic-live-restored.db');
  const db = new DatabaseSync(input);
  try {
    db.exec(`PRAGMA journal_mode=WAL;
      PRAGMA wal_autocheckpoint=0;
      CREATE TABLE sidequest_athlete_database_owner(singleton INTEGER PRIMARY KEY, user_id TEXT NOT NULL);
      INSERT INTO sidequest_athlete_database_owner VALUES (1, 'synthetic-wal-a');
      CREATE TABLE training_blocks(id TEXT PRIMARY KEY);
      INSERT INTO training_blocks VALUES ('committed-before-backup');
    `);
    assert.equal(existsSync(input + '-wal'), true, 'WAL file must be present');
    const sourceHash = checksum(input);
    const walHash = checksum(input + '-wal');
    const backed = execute(backupScript, [input, snapshot], {
      SIDEQUEST_QA_SYNTHETIC_BACKUP: '1',
    });
    assert.equal(backed.status, 0, backed.stderr);
    assert.equal(checksum(input), sourceHash, 'Source main database bytes changed');
    assert.equal(checksum(input + '-wal'), walHash, 'Live WAL bytes changed');
    const restoredRun = execute(restoreScript, [snapshot, restored], {
      SIDEQUEST_QA_SYNTHETIC_RESTORE: '1',
      SIDEQUEST_QA_EXPECTED_OWNER_ID: 'synthetic-wal-a',
    });
    assert.equal(restoredRun.status, 0, restoredRun.stderr);
    const check = new DatabaseSync(restored, { readOnly: true });
    try {
      assert.equal(check.prepare('SELECT id FROM training_blocks').get().id,
        'committed-before-backup');
    } finally {
      check.close();
    }
  } finally {
    db.close();
  }
});

test('unverified synthetic legacy owner refuses restore without output', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sidequest-synthetic-unknown-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = join(dir, 'synthetic-unmarked.db');
  const output = join(dir, 'synthetic-denied.db');
  const db = new DatabaseSync(source);
  try {
    db.exec("CREATE TABLE training_blocks(id TEXT); INSERT INTO training_blocks VALUES ('unclaimed');");
  } finally {
    db.close();
  }
  const originalHash = checksum(source);
  const denied = execute(restoreScript, [source, output], {
    SIDEQUEST_QA_SYNTHETIC_RESTORE: '1',
    SIDEQUEST_QA_EXPECTED_OWNER_ID: 'synthetic-unknown-a',
  });
  assert.notEqual(denied.status, 0);
  assert.equal(existsSync(output), false);
  assert.equal(checksum(source), originalHash);
});

test('foreign key corruption fails closed without publishing synthetic restore', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sidequest-synthetic-fk-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = join(dir, 'synthetic-invalid-fk.db');
  const output = join(dir, 'synthetic-invalid-fk-restored.db');
  const db = new DatabaseSync(source);
  try {
    db.exec(`CREATE TABLE sidequest_athlete_database_owner(singleton INTEGER PRIMARY KEY, user_id TEXT);
      INSERT INTO sidequest_athlete_database_owner VALUES (1, 'synthetic-fk-a');
      CREATE TABLE parent(id INTEGER PRIMARY KEY);
      CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
      PRAGMA foreign_keys = OFF;
      INSERT INTO child VALUES (1, 999);
    `);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 1);
  } finally {
    db.close();
  }
  const originalHash = checksum(source);
  const denied = execute(restoreScript, [source, output], {
    SIDEQUEST_QA_SYNTHETIC_RESTORE: '1',
    SIDEQUEST_QA_EXPECTED_OWNER_ID: 'synthetic-fk-a',
  });
  assert.notEqual(denied.status, 0);
  assert.equal(existsSync(output), false);
  assert.equal(checksum(source), originalHash);
});
