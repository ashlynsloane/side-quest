import type { SideQuestPrimaryTab } from '@circuit/domain';

export interface SideQuestRuntimeSessionSnapshot {
  activeTab: SideQuestPrimaryTab;
  updatedAt: string;
}

export interface SideQuestRuntimeSessionStorage {
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
}

const VALID_TABS = new Set<SideQuestPrimaryTab>(['today', 'train', 'plan', 'progress', 'you']);

export function parseRuntimeSession(value: string | null): SideQuestRuntimeSessionSnapshot | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<SideQuestRuntimeSessionSnapshot>;
    if (!parsed.activeTab || !VALID_TABS.has(parsed.activeTab)) return undefined;
    return {
      activeTab: parsed.activeTab,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return undefined;
  }
}

export async function loadRuntimeSession(storage: SideQuestRuntimeSessionStorage) {
  return parseRuntimeSession(await storage.read());
}

export async function saveRuntimeSession(
  storage: SideQuestRuntimeSessionStorage,
  activeTab: SideQuestPrimaryTab,
) {
  const snapshot: SideQuestRuntimeSessionSnapshot = {
    activeTab,
    updatedAt: new Date().toISOString(),
  };
  await storage.write(JSON.stringify(snapshot));
  return snapshot;
}
