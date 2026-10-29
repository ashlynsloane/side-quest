/** Active-profile SQLite adapter. No standalone database or cloud writes. */
import type { SQLiteDatabase } from 'expo-sqlite';
import { createInjuryMemoryStore, type InjuryMemoryStore } from '@circuit/planner';
import { withActiveSqliteDatabase } from './database';
import { ensureBackupBeforeFirstInjuryMigration } from './local-database-backup';

/**
 * One backup/migration at a time for each open profile database connection.
 * Different locally signed-in profiles never share an initialization promise.
 */
const initializationByConnection=new WeakMap<SQLiteDatabase,Promise<void>>();

async function ensureInjurySchema(db:SQLiteDatabase):Promise<void> {
  let task=initializationByConnection.get(db);
  if(!task) {
    task=(async()=>{
      await ensureBackupBeforeFirstInjuryMigration(db);
      await createInjuryMemoryStore(db).ensureSchema();
    })();
    initializationByConnection.set(db,task);
    void task.catch(()=>initializationByConnection.delete(db));
  }
  await task;
}

export async function withInjuryMemoryStore<T>(
  callback: (store: InjuryMemoryStore) => Promise<T>,
): Promise<T> {
  return withActiveSqliteDatabase(async database => {
    await ensureInjurySchema(database);
    const store = createInjuryMemoryStore(database);
    return callback(store);
  });
}
