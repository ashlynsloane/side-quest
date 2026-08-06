import React, { useCallback, useMemo, useState } from 'react';
import type {
  SideQuestPrimaryTab,
  V29PlanAction,
  V29ProgressAction,
  V29TodayAction,
  V29TrainAction,
  V29YouAction,
} from '@circuit/domain';
import {
  SideQuestWorkspaceRoot,
  type SideQuestWorkspaceRootProps,
} from './SideQuestWorkspaceRoot';

export type SideQuestRuntimeAction =
  | { workspace: 'today'; action: V29TodayAction }
  | { workspace: 'train'; action: V29TrainAction }
  | { workspace: 'plan'; action: V29PlanAction }
  | { workspace: 'progress'; action: V29ProgressAction }
  | { workspace: 'you'; action: V29YouAction }
  | { workspace: 'shell'; action: 'inbox' | 'search' | 'profile' | 'none' }
  | { workspace: 'workout'; action: 'resume'; workoutId: string };

export interface SideQuestRuntimeNavigator {
  getActiveTab?: () => SideQuestPrimaryTab;
  navigateToTab?: (tab: SideQuestPrimaryTab) => void;
  dispatch: (event: SideQuestRuntimeAction) => void;
}

export interface SideQuestRuntimeBridgeProps
  extends Omit<SideQuestWorkspaceRootProps, 'handlers' | 'initialTab' | 'activeTab'> {
  navigator: SideQuestRuntimeNavigator;
  initialTab?: SideQuestPrimaryTab;
}

export function SideQuestRuntimeBridge({
  navigator,
  initialTab = 'today',
  ...rootProps
}: SideQuestRuntimeBridgeProps) {
  const [localTab, setLocalTab] = useState<SideQuestPrimaryTab>(
    navigator.getActiveTab?.() ?? initialTab,
  );

  const setTab = useCallback((tab: SideQuestPrimaryTab) => {
    setLocalTab(tab);
    navigator.navigateToTab?.(tab);
  }, [navigator]);

  const handlers = useMemo<SideQuestWorkspaceRootProps['handlers']>(() => ({
    today: action => navigator.dispatch({ workspace: 'today', action }),
    train: action => navigator.dispatch({ workspace: 'train', action }),
    plan: action => navigator.dispatch({ workspace: 'plan', action }),
    progress: action => navigator.dispatch({ workspace: 'progress', action }),
    you: action => navigator.dispatch({ workspace: 'you', action }),
    header: action => navigator.dispatch({ workspace: 'shell', action }),
    resumeWorkout: workoutId => navigator.dispatch({ workspace: 'workout', action: 'resume', workoutId }),
    tabChanged: setTab,
  }), [navigator, setTab]);

  return (
    <SideQuestWorkspaceRoot
      {...rootProps}
      activeTab={localTab}
      handlers={handlers}
    />
  );
}
