/**
 * On-device backup of the active Side Quest profile's SQLite database.
 *
 * Run before the first additive rehabilitation migration.
 * Uses Expo's SQLite online backup API, which safely handles WAL mode.
 * The backup remains on this device, contains sensitive personal records, and
 * is not automatically synchronized, exported, shared, or uploaded.
 */
import * as SQLite from 'expo-sqlite';
import { getActiveDatabaseName, withActiveSqliteDatabase } from './database';

export interface VerifiedLocalBackup {
  sourceDatabaseName: string;
  backupDatabaseName: string;
  createdAt: string;
  integrityCheck: 'ok';
  tableRowCounts: Record<string, number>;
}

type CountRow = { count: number };
type TableRow = { name: string };
const safeTable = (name: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
async function counts(db: SQLite.SQLiteDatabase): Promise<Record<string,number>> {
  const rows = await db.getAllAsync<TableRow>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  const output:Record<string,number>={};
  for (const {name} of rows) {
    if (!safeTable(name)) throw new Error('Unexpected table name in database.');
    const result = await db.getFirstAsync<CountRow>(
      'SELECT COUNT(*) AS count FROM "' + name + '"',
    );
    output[name]=result?.count??0;
  }
  return output;
}
async function backupActiveConnection(
  source: SQLite.SQLiteDatabase,
  sourceName: string,
): Promise<VerifiedLocalBackup> {
  const createdAt=new Date().toISOString();
  const stamp=createdAt.replace(/[^0-9]/g,'');
  const suffix=Math.floor(Math.random()*1000000).toString().padStart(6,'0');
  const backupDatabaseName='sidequest-backup-'+
    sourceName.replace(/[^a-zA-Z0-9_-]/g,'_')+'-'+stamp+'-'+suffix+'.db';
  const before=await counts(source);
  const destination=await SQLite.openDatabaseAsync(backupDatabaseName);
  try {
    await SQLite.backupDatabaseAsync({
      sourceDatabase:source,sourceDatabaseName:'main',
      destDatabase:destination,destDatabaseName:'main',
    });
    const row=await destination.getFirstAsync<{ integrity_check:string }>(
      'PRAGMA integrity_check',
    );
    if(row?.integrity_check!=='ok') throw new Error('Backup SQLite integrity check failed.');
    const after=await counts(destination);
    if(Object.keys(before).length!==Object.keys(after).length ||
      Object.entries(before).some(([table,count])=>after[table]!==count)) {
      throw new Error('Backup table counts do not match the source snapshot.');
    }
    return {
      sourceDatabaseName:sourceName,backupDatabaseName,createdAt,
      integrityCheck:'ok',tableRowCounts:after,
    };
  } finally {
    await destination.closeAsync();
  }
}

/** User-initiated (or first-migration) local backup. Returns backup identity only. */
export async function createVerifiedLocalDatabaseBackup():Promise<VerifiedLocalBackup> {
  return withActiveSqliteDatabase(async db=>
    backupActiveConnection(db,getActiveDatabaseName()));
}

/**
 * Ensure a verified pre-migration backup exists before writing any injury tables.
 * A failed backup aborts the migration. The backup is not considered a
 * demonstrated restore until an actual on-device restore test has been run.
 */
export async function ensureBackupBeforeFirstInjuryMigration(
  db:SQLite.SQLiteDatabase,
):Promise<VerifiedLocalBackup|null> {
  const existing=await db.getFirstAsync<{name:string}>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='injury_schema_metadata'",
  );
  if(existing) return null;
  return backupActiveConnection(db,getActiveDatabaseName());
}


/**
 * Restores the backup into a disposable, separate SQLite database, validates
 * its integrity and row counts, and deletes the disposable copy.
 * NEVER overwrites or replaces the active athlete database.
 *
 * This proves logical content can be copied and read back in the current
 * runtime; release qualification still requires a real iOS/Android restore.
 */
export async function verifyBackupRestorationInSandbox(
  backup: VerifiedLocalBackup,
): Promise<{verified:boolean;tableRowCounts:Record<string,number>}> {
  if (!/^sidequest-backup-[a-zA-Z0-9_-]+-[0-9]+\.db$/.test(backup.backupDatabaseName)) {
    throw new Error('Invalid local backup database identity.');
  }
  const check=await SQLite.openDatabaseAsync(backup.backupDatabaseName);
  const sandboxName='sidequest-restore-test-'+
    new Date().toISOString().replace(/[^0-9]/g,'')+'-'+
    Math.floor(Math.random()*1000000)+'.db';
  let sandbox:SQLite.SQLiteDatabase|null=null;
  try {
    const integrity=await check.getFirstAsync<{integrity_check:string}>('PRAGMA integrity_check');
    if (integrity?.integrity_check!=='ok') throw new Error('Backup failed SQLite integrity check.');
    sandbox=await SQLite.openDatabaseAsync(sandboxName);
    await SQLite.backupDatabaseAsync({
      sourceDatabase:check,sourceDatabaseName:'main',
      destDatabase:sandbox,destDatabaseName:'main',
    });
    const restored=await counts(sandbox);
    const expected=backup.tableRowCounts;
    if (Object.keys(expected).length!==Object.keys(restored).length ||
      Object.entries(expected).some(([name,n])=>restored[name]!==n)) {
      throw new Error('Restored sandbox data does not match backup manifest.');
    }
    const restoredIntegrity=await sandbox.getFirstAsync<{integrity_check:string}>(
      'PRAGMA integrity_check',
    );
    if (restoredIntegrity?.integrity_check!=='ok') {
      throw new Error('Restored sandbox failed SQLite integrity check.');
    }
    return {verified:true,tableRowCounts:restored};
  } finally {
    await sandbox?.closeAsync();
    await check.closeAsync();
    if(sandbox) await SQLite.deleteDatabaseAsync(sandboxName);
  }
}
