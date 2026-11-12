import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const script = new URL('../../../scripts/qa/audit-legacy-owner.mjs', import.meta.url).pathname;
const scratch: string[] = [];

function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'side-quest-owner-audit-'));
  scratch.push(folder);
  const path = join(folder, 'synthetic-legacy.db');
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE completed_workouts (id TEXT PRIMARY KEY, workout_json TEXT)');
  db.prepare('INSERT INTO completed_workouts (id, workout_json) VALUES (?, ?)')
    .run('fake-activity', '{"synthetic":true}');
  db.close();
  return path;
}
function sha(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function inspect(path: string, expected?: string) {
  const result = spawnSync(process.execPath, [script, path], {
    encoding: 'utf8',
    env: { ...process.env,
      SIDEQUEST_QA_EXPECTED_OWNER_ID: expected ?? '',
    },
  });
  const body = result.stdout.trim() ? JSON.parse(result.stdout) as {
    schemaVersion: number; mode: string; ownerStatus: string;
    integrityOk: boolean; userTablesExist: boolean;
  } : null;
  return { result, body };
}
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('read-only legacy SQLite ownership audit', () => {
  it('denies populated unmarked legacy files without modifying their bytes or publishing training rows', () => {
    const path = fixture();
    const original = sha(path);
    const { result, body } = inspect(path, 'athlete-a');
    expect(result.status).toBe(2);
    expect(body?.ownerStatus).toBe('LEGACY_OWNER_UNVERIFIED');
    expect(body?.userTablesExist).toBe(true);
    expect(body?.integrityOk).toBe(true);
    expect(sha(path)).toBe(original);
    expect(result.stdout).not.toContain('athlete-a');
    expect(result.stdout).not.toContain('fake-activity');
    expect(result.stdout).not.toContain('synthetic');
  });

  it('verifies an in-file owner marker only when independently supplied expected identity matches', () => {
    const path = fixture();
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE sidequest_athlete_database_owner (singleton INTEGER PRIMARY KEY, user_id TEXT)');
    db.prepare('INSERT INTO sidequest_athlete_database_owner VALUES (1, ?)').run('athlete-a');
    db.close();
    const original = sha(path);
    const verified = inspect(path, 'athlete-a');
    expect(verified.result.status).toBe(0);
    expect(verified.body?.mode).toBe('read_only_no_migration');
    expect(verified.body?.ownerStatus).toBe('VERIFIED_OWNER');
    expect(sha(path)).toBe(original);
    expect(verified.result.stdout).not.toContain('athlete-a');

    expect(inspect(path, 'athlete-b').body?.ownerStatus).toBe('OWNER_MISMATCH');
    expect(inspect(path, 'athlete-b').result.status).toBe(2);
    expect(inspect(path).body?.ownerStatus).toBe('OWNER_MISMATCH');
    // The empty environment value deliberately does not match athlete-a.
    expect(sha(path)).toBe(original);
  });

  it('does not create a missing database or claim an empty unowned file', () => {
    const folder = mkdtempSync(join(tmpdir(), 'side-quest-audit-missing-'));
    scratch.push(folder);
    const missing = join(folder, 'missing.db');
    expect(inspect(missing, 'athlete-a').result.status).toBe(2);
    expect(existsSync(missing)).toBe(false);
    const blank = join(folder, 'empty.db');
    const db = new DatabaseSync(blank);
    db.close();
    const before = sha(blank);
    expect(inspect(blank, 'athlete-a').body?.ownerStatus).toBe('EMPTY_UNCLAIMED');
    expect(sha(blank)).toBe(before);
  });
});
