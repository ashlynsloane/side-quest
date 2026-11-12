import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const script = new URL('../../../scripts/qa/backup-synthetic-legacy-sqlite.mjs', import.meta.url).pathname;
const scratch: string[] = [];
function folder(): string {
  const path = mkdtempSync(join(tmpdir(), 'sidequest-synthetic-backup-'));
  scratch.push(path);
  return path;
}
function invoke(source: string, output: string, authorized = true) {
  return spawnSync(process.execPath, [script, source, output], {
    encoding: 'utf8',
    env: { ...process.env,
      SIDEQUEST_QA_SYNTHETIC_BACKUP: authorized ? '1' : '0',
    },
  });
}
function sha(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('synthetic-only legacy SQLite backup rehearsal', () => {
  it('captures committed WAL records consistently and does not mutate original fixture bytes', () => {
    const dir = folder();
    const source = join(dir, 'synthetic-old-profile.db');
    const destination = join(dir, 'synthetic-snapshot.db');
    const writer = new DatabaseSync(source);
    try {
      writer.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA wal_autocheckpoint = 0;
        CREATE TABLE completed_workouts (id TEXT PRIMARY KEY, completed_at TEXT);
        CREATE TABLE sidequest_athlete_database_owner (
          singleton INTEGER PRIMARY KEY, user_id TEXT NOT NULL
        );
      `);
      writer.prepare('INSERT INTO completed_workouts VALUES (?, ?)')
        .run('synthetic-committed-in-wal', '2026-11-11T10:00:00Z');
      writer.prepare('INSERT INTO sidequest_athlete_database_owner VALUES (1, ?)')
        .run('synthetic-owner-a');
      expect(existsSync(source + '-wal')).toBe(true);
      const originalDbHash = sha(source);
      const originalWalHash = sha(source + '-wal');

      const result = invoke(source, destination);
      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout) as {
        mode: string; integrityOk: boolean; migrated: boolean; ownerVerified: boolean;
      };
      expect(report).toMatchObject({
        mode: 'synthetic_only_online_sqlite_backup',
        integrityOk: true, migrated: false, ownerVerified: false,
      });
      expect(result.stdout).not.toContain('synthetic-owner-a');
      expect(result.stdout).not.toContain('synthetic-committed-in-wal');
      expect(sha(source)).toBe(originalDbHash);
      expect(sha(source + '-wal')).toBe(originalWalHash);

      const backup = new DatabaseSync(destination, { readOnly: true });
      try {
        expect(backup.prepare('SELECT id FROM completed_workouts').get()?.id)
          .toBe('synthetic-committed-in-wal');
        expect(backup.prepare(
          'SELECT user_id FROM sidequest_athlete_database_owner WHERE singleton=1',
        ).get()?.user_id).toBe('synthetic-owner-a');
      } finally {
        backup.close();
      }
    } finally {
      writer.close();
    }
  });

  it('never overwrites an existing snapshot or changes the legacy source', () => {
    const dir = folder();
    const source = join(dir, 'synthetic-old-profile.db');
    const destination = join(dir, 'synthetic-snapshot.db');
    const db = new DatabaseSync(source);
    db.exec('CREATE TABLE example (id INTEGER)');
    db.close();
    writeFileSync(destination, 'do-not-overwrite');
    const original = sha(source);
    const existing = sha(destination);
    const result = invoke(source, destination);
    expect(result.status).toBe(2);
    expect(sha(destination)).toBe(existing);
    expect(sha(source)).toBe(original);
  });

  it('denies missing authorization, non-synthetic filenames and absent source', () => {
    const dir = folder();
    const source = join(dir, 'synthetic-old-profile.db');
    const destination = join(dir, 'synthetic-snapshot.db');
    const db = new DatabaseSync(source);
    db.exec('CREATE TABLE example (id INTEGER)');
    db.close();
    const original = sha(source);
    expect(invoke(source, destination, false).status).toBe(2);
    expect(invoke(source.replace('synthetic-', 'athlete-'), destination).status).toBe(2);
    expect(invoke(source, join(dir, 'real-user.db')).status).toBe(2);
    expect(invoke(source, source).status).toBe(2);
    expect(existsSync(destination)).toBe(false);
    expect(sha(source)).toBe(original);
  });
});
