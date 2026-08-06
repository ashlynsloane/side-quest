import React, { useEffect, useMemo, useState } from 'react';
import type { SideQuestPrimaryTab } from '@circuit/domain';
import {
  SideQuestRuntimeBridge,
  type SideQuestRuntimeBridgeProps,
} from '../v29/SideQuestRuntimeBridge';
import {
  createRuntimeOrchestrator,
  type SideQuestRouterAdapter,
  type SideQuestRuntimeCommands,
} from '../../services/runtime-orchestrator';
import {
  loadRuntimeSession,
  saveRuntimeSession,
  type SideQuestRuntimeSessionStorage,
} from '../../services/runtime-session-store';

export interface SideQuestAppRuntimeProps
  extends Omit<SideQuestRuntimeBridgeProps, 'navigator' | 'initialTab'> {
  router: SideQuestRouterAdapter;
  commands?: SideQuestRuntimeCommands;
  sessionStorage?: SideQuestRuntimeSessionStorage;
  fallbackTab?: SideQuestPrimaryTab;
}

export function SideQuestAppRuntime({
  router,
  commands,
  sessionStorage,
  fallbackTab = 'today',
  ...bridgeProps
}: SideQuestAppRuntimeProps) {
  const [initialTab, setInitialTab] = useState<SideQuestPrimaryTab | undefined>(
    sessionStorage ? undefined : fallbackTab,
  );

  useEffect(() => {
    let active = true;
    if (!sessionStorage) return;
    void loadRuntimeSession(sessionStorage).then(snapshot => {
      if (active) setInitialTab(snapshot?.activeTab ?? fallbackTab);
    });
    return () => { active = false; };
  }, [fallbackTab, sessionStorage]);

  const navigator = useMemo(() => createRuntimeOrchestrator({
    router,
    commands,
    initialTab: initialTab ?? fallbackTab,
    onTabChanged: tab => sessionStorage ? saveRuntimeSession(sessionStorage, tab).then(() => undefined) : undefined,
  }), [commands, fallbackTab, initialTab, router, sessionStorage]);

  if (!initialTab) return null;

  return (
    <SideQuestRuntimeBridge
      {...bridgeProps}
      initialTab={initialTab}
      navigator={navigator}
    />
  );
}
