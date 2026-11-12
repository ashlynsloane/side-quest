import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const backup = new URL('../../../scripts/qa/backup-synthetic-legacy-sqlite.mjs', import.meta.url).pathname;
const restore = new URL('../../../scripts/qa/restore-synthetic-legacy-sqlite.mjs', import.meta.url).pathname;
const scratch: string[] = [];
function folder() {
  const dir = mkdtempSync(join(tmpdir(), 'sidequest-synthetic-restore-'));
  scratch.push(dir);
  return dir;
}
function run(script: string, source: string, destination: string,
  allowed: boolean, owner = 'synthetic-owner-a') {
  return spawnSync(process.execPath, [script, source, destination], {
    encoding: 'utf8',
    env: { ...process.env,
      SIDEQUEST_QA_SYNTHETIC_BACKUP: allowed ? '1' : '0',
      SIDEQUEST_QA_SYNTHETIC_RESTORE: allowed ? '1' : '0',
      SIDEQUEST_QA_EXPECTED_OWNER_ID: owner,
    },
  });
}
function digest(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('synthetic-only WAL snapshot restore and rollback rehearsal', () => {
  it('recovers a complete real SQLite snapshot into a new file without changing old bytes', () => {
    const dir = folder();
    const source = join(dir, 'synthetic-legacy-owner.db');
    const snapshot = join(dir, 'synthetic-online-backup.db');
    const recovered = join(dir, 'synthetic-restored-new.db');
    const writer = new DatabaseSync(source);
    try {
      writer.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA wal_autocheckpoint = 0;
        CREATE TABLE sidequest_athlete_database_owner (
          singleton INTEGER PRIMARY KEY, user_id TEXT NOT NULL
        );
        CREATE TABLE completed_workouts (id TEXT PRIMARY KEY, completion_fraction REAL);
        CREATE TABLE workout_ledger (id TEXT PRIMARY KEY, completion_fraction REAL);
      `);
      writer.prepare('INSERT INTO sidequest_athlete_database_owner VALUES (1, ?)').run('synthetic-owner-a');
      writer.prepare('INSERT INTO completed_workouts VALUES (?, ?)').run('synthetic-partial-workout', 0.37);
      writer.prepare('INSERT INTO workout_ledger VALUES (?, ?)').run('synthetic-partial-workout', 0.37);
      expect(existsSync(source + '-wal')).toBe(true);
      const sourceHash = digest(source);
      const walHash = digest(source + '-wal');

      const backupResult = run(backup, source, snapshot, true);
      expect(backupResult.status, backupResult.stderr).toBe(0);
      const snapshotHash = digest(snapshot);
      const restoredResult = run(restore, snapshot, recovered, true);
      expect(restoredResult.status, restoredResult.stderr).toBe(0);
      const report = JSON.parse(restoredResult.stdout) as {
        mode: string; ownerVerified: boolean; integrityOk: boolean;
        restoredToNewFile: boolean; migratedRealAthleteData: boolean;
      };
      expect(report).toMatchObject({
        mode: 'synthetic_only_restore_rehearsal',
        ownerVerified: true, integrityOk: true,
        restoredToNewFile: true, migratedRealAthleteData: false,
      });
      expect(restoredResult.stdout).not.toContain('synthetic-owner-a');
      expect(restoredResult.stdout).not.toContain('synthetic-partial-workout');
      expect(digest(source)).toBe(sourceHash);
      expect(digest(source + '-wal')).toBe(walHash);
      expect(digest(snapshot)).toBe(snapshotHash);

      const recoveredDb = new DatabaseSync(recovered, { readOnly: true });
      try {
        expect(recoveredDb.prepare('PRAGMA quick_check').get()?.quick_check).toBe('ok');
        expect(recoveredDb.prepare('SELECT user_id FROM sidequest_athlete_database_owner').get()?.user_id)
          .toBe('synthetic-owner-a');
        expect(recoveredDb.prepare('SELECT id, completion_fraction FROM completed_workouts').get())
          .toMatchObject({ id: 'synthetic-partial-workout', completion_fraction: 0.37 });
        expect(recoveredDb.prepare('SELECT id, completion_fraction FROM workout_ledger').get())
          .toMatchObject({ id: 'synthetic-partial-workout', completion_fraction: 0.37 });
      } finally {
        recoveredDb.close();
      }
    } finally {
      writer.close();
    }
  });

  it('denies mismatched, missing or non-synthetic provenance without creating output', () => {
    const dir = folder();
    const source = join(dir, 'synthetic-provenance.db');
    const destination = join(dir, 'synthetic-restored-new.db');
    const db = new DatabaseSync(source);
    db.exec(`CREATE TABLE sidequest_athlete_database_owner (
      singleton INTEGER PRIMARY KEY, user_id TEXT NOT NULL
    ); CREATE TABLE completed_workouts (id TEXT PRIMARY KEY);`);
    db.prepare('INSERT INTO sidequest_athlete_database_owner VALUES (1, ?)')
      .run('synthetic-owner-a');
    db.close();
    const before = digest(source);
    expect(run(restore, source, destination, false).status).toBe(2);
    expect(run(restore, source, destination, true, 'synthetic-owner-b').status).toBe(2);
    expect(run(restore, source, destination, true, 'local_actual-user@example.com').status).toBe(2);
    expect(run(restore, source.replace('synthetic-', 'real-'), destination, true).status).toBe(2);
    expect(run(restore, source, join(dir, 'real-restored.db'), true).status).toBe(2);
    expect(existsSync(destination)).toBe(false);
    expect(digest(source)).toBe(before);
  });

  it('never overwrites an existing restoration target or allows same-file restore', () => {
    const dir = folder();
    const source = join(dir, 'synthetic-owner-source.db');
    const target = join(dir, 'synthetic-restored-new.db');
    const db = new DatabaseSync(source);
    db.exec(`CREATE TABLE sidequest_athlete_database_owner (
      singleton INTEGER PRIMARY KEY, user_id TEXT NOT NULL
    );`);
    db.prepare('INSERT INTO sidequest_athlete_database_owner VALUES (1, ?)')
      .run('synthetic-owner-a');
    db.close();
    writeFileSync(target, 'DO NOT REPLACE');
    const originalHash = digest(source), targetHash = digest(target);
    expect(run(restore, source, target, true).status).toBe(2);
    expect(run(restore, source, source, true).status).toBe(2);
    expect(digest(target)).toBe(targetHash);
    expect(digest(source)).toBe(originalHash);
  });
});
