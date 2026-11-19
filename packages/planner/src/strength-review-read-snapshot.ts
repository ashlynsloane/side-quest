import type { TrainingAdjustmentSqlDriver } from './training-adjustment-sqlite';

/**
 * A read-only SQLite snapshot for historical strength reviews. This MUST use
 * the native exclusive transaction handle, not a collection of independent
 * async reads from a mutable connection. Missing support fails closed.
 *
 * The snapshot is NOT a workout approval transaction; it does not write.
 */
export async function withUnapprovedStrengthReadSnapshot<T>(
  sql: TrainingAdjustmentSqlDriver,
  read: (snapshot: TrainingAdjustmentSqlDriver) => Promise<T>,
): Promise<T> {
  if (typeof sql.readSnapshot !== 'function') {
    throw new Error('Consistent strength review snapshot is unavailable on this platform.');
  }
  return sql.readSnapshot(read);
}
