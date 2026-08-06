import React, { useMemo } from 'react';
import type { SideQuestPrimaryTab } from '@circuit/domain';
import type { SideQuestCanonicalWorkspaceModels } from '../v29/SideQuestWorkspaceRoot';
import type { SideQuestActiveWorkoutBar } from '@circuit/domain';
import { SideQuestAppRuntime } from '../v30/SideQuestAppRuntime';
import { createExpoRouterAdapter, routeNameToPrimaryTab, type ExpoLikeRouter } from '../v30/expo-router-adapter';
import type { SideQuestRuntimeCommands } from '../../services/runtime-orchestrator';
import type { SideQuestRuntimeSessionStorage } from '../../services/runtime-session-store';

export interface SideQuestLiveRuntimeProps {
  router: ExpoLikeRouter;
  routeName?: string;
  canonical: SideQuestCanonicalWorkspaceModels;
  commands?: SideQuestRuntimeCommands;
  sessionStorage?: SideQuestRuntimeSessionStorage;
  activeWorkout?: Omit<SideQuestActiveWorkoutBar, 'resumeLabel' | 'visibleAcrossTabs'>;
  contextLabel?: string;
  phaseContext?: string;
  unresolvedAttentionCount?: number;
  workoutPlayerOpen?: boolean;
  fallbackTab?: SideQuestPrimaryTab;
}

export function SideQuestLiveRuntime({
  router,
  routeName,
  canonical,
  commands,
  sessionStorage,
  activeWorkout,
  contextLabel,
  phaseContext,
  unresolvedAttentionCount,
  workoutPlayerOpen,
  fallbackTab,
}: SideQuestLiveRuntimeProps) {
  const routerAdapter = useMemo(() => createExpoRouterAdapter(router), [router]);
  const routeTab = routeNameToPrimaryTab(routeName);

  return (
    <SideQuestAppRuntime
      router={routerAdapter}
      commands={commands}
      sessionStorage={sessionStorage}
      fallbackTab={fallbackTab ?? routeTab}
      canonical={canonical}
      activeWorkout={activeWorkout}
      contextLabel={contextLabel}
      phaseContext={phaseContext}
      unresolvedAttentionCount={unresolvedAttentionCount}
      workoutPlayerOpen={workoutPlayerOpen}
    />
  );
}
