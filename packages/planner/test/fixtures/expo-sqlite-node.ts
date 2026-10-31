/** Node-only stub for the isolated Expo SQLite transport.
 * The disk-backed Vitest adapter replaces openDatabaseSync in tests.
 * This module must have a different identity from the React Native mock.
 */
export function openDatabaseSync(): never {
  throw new Error('Expo SQLite transport must be mocked with Node disk SQLite');
}
