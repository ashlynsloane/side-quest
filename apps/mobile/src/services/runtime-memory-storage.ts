import type { SideQuestRuntimeSessionStorage } from './runtime-session-store';

export function createRuntimeMemoryStorage(initialValue: string | null = null): SideQuestRuntimeSessionStorage {
  let value = initialValue;
  return {
    read: async () => value,
    write: async next => { value = next; },
  };
}

export function createNamespacedRuntimeStorage(
  storage: { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> },
  key = 'sidequest.runtime.session.v31',
): SideQuestRuntimeSessionStorage {
  return {
    read: () => storage.getItem(key),
    write: value => storage.setItem(key, value),
  };
}
