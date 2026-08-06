import React, { useSyncExternalStore } from 'react';
import type { SideQuestPrimaryTab } from '@circuit/domain';
import type { ExpoLikeRouter } from '../v30/expo-router-adapter';
import type { SideQuestRuntimeEntrySource } from './runtime-entry-contract';
import { SideQuestLiveRuntime } from './SideQuestLiveRuntime';

export interface SideQuestReactiveRuntimeProps {
  router: ExpoLikeRouter;
  source: SideQuestRuntimeEntrySource;
  routeName?: string;
  fallbackTab?: SideQuestPrimaryTab;
}

const noSubscribe = () => () => undefined;

export function SideQuestReactiveRuntime({
  router,
  source,
  routeName,
  fallbackTab,
}: SideQuestReactiveRuntimeProps) {
  const snapshot = useSyncExternalStore(
    source.subscribe ?? noSubscribe,
    source.getSnapshot,
    source.getSnapshot,
  );

  return (
    <SideQuestLiveRuntime
      router={router}
      routeName={routeName}
      fallbackTab={fallbackTab}
      {...snapshot}
    />
  );
}
