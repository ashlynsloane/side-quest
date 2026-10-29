/** Active-profile SQLite adapter. No standalone database or cloud writes. */
import { createInjuryMemoryStore, type InjuryMemoryStore } from '@circuit/planner';
import { withActiveSqliteDatabase } from './database';

export async function withInjuryMemoryStore<T>(
  callback: (store: InjuryMemoryStore) => Promise<T>,
): Promise<T> {
  return withActiveSqliteDatabase(async database => {
    const store = createInjuryMemoryStore(database);
    await store.ensureSchema();
    return callback(store);
  });
}
