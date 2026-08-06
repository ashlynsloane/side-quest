import type { SideQuestRuntimeEntrySource, SideQuestRuntimeEntryState } from './runtime-entry-contract';

export interface SideQuestRuntimeEntryStore extends SideQuestRuntimeEntrySource {
  setSnapshot: (next: SideQuestRuntimeEntryState) => void;
  update: (updater: (current: SideQuestRuntimeEntryState) => SideQuestRuntimeEntryState) => void;
}

export function createSideQuestRuntimeEntryStore(initial: SideQuestRuntimeEntryState): SideQuestRuntimeEntryStore {
  let snapshot = initial;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSnapshot: next => {
      if (Object.is(next, snapshot)) return;
      snapshot = next;
      emit();
    },
    update: updater => {
      const next = updater(snapshot);
      if (Object.is(next, snapshot)) return;
      snapshot = next;
      emit();
    },
  };
}
