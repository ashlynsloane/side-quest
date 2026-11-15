// Standalone synthetic-only SQLite recovery acceptance using Node 22's SQLite.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const backupScript = fileURLToPath(new URL('./backup-synthetic-legacy-sqlite.mjs', import.meta.url));
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
      CREATE TABLE sidequest_athlete_database_owner(singleton INTEGER PRIMARY KEY, user_id TEXT NOT NULL);
      INSERT INTO sidequest_athlete_database_owner VALUES (1, 'synthetic-athlete-a');
      CREATE TABLE training_blocks(id TEXT PRIMARY KEY);
      INSERT INTO training_blocks VALUES ('week-a');
      CREATE TABLE athlete_plan_notes(id INTEGER PRIMARY KEY, text TEXT);
      INSERT INTO athlete_plan_notes VALUES (1, 'fixture-only');
      CREATE TABLE synthetic_blob_metadata(id INTEGER PRIMARY KEY, raw BLOB, note TEXT);
      INSERT INTO synthetic_blob_metadata VALUES (1, x'00FF10', 'binary-fixture');
    `);
  } finally {
    db.close();
  }
  const backup = execute(backupScript, [input, snapshot], {
    SIDEQUEST_QA_SYNTHETIC_BACKUP: '1',
  });
  assert.equal(backup.status, 0, backup.stderr);
  const restore = execute(restoreScript, [snapshot, restored], {
    SIDEQUEST_QA_SYNTHETIC_RESTORE: '1',
    SIDEQUEST_QA_EXPECTED_OWNER_ID: 'synthetic-athlete-a',
  });
  assert.equal(restore.status, 0, restore.stderr);
  assert.equal(JSON.parse(restore.stdout).restoredToNewFile, true);
  const check = new DatabaseSync(restored, { readOnly: true });
  try {
    assert.equal(check.prepare('PRAGMA user_version').get().user_version, 7);
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
  assert.equal(existsSync(deniedOwner), false);

  const deniedOverwrite = execute(restoreScript, [snapshot, restored], {
    SIDEQUEST_QA_SYNTHETIC_RESTORE: '1',
    SIDEQUEST_QA_EXPECTED_OWNER_ID: 'synthetic-athlete-a',
  });
  assert.notEqual(deniedOverwrite.status, 0);
  assert.equal(existsSync(restored), true);
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
