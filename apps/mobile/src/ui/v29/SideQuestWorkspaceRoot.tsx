import React, { useMemo, useState } from 'react';
import type {
  PlanWorkspaceModel,
  ProgressWorkspaceModel,
  SideQuestActiveWorkoutBar,
  SideQuestPrimaryTab,
  TodayWorkspaceModel,
  TrainWorkspaceModel,
  V29PlanAction,
  V29ProgressAction,
  V29TodayAction,
  V29TrainAction,
  V29YouAction,
  YouWorkspaceModel,
} from '@circuit/domain';
import { buildMobileShellState } from '../../services/visible-ui-shell';
import { buildMobileVisibleTodayScreen } from '../../services/visible-today-workspace';
import { buildMobileVisibleTrainWorkspace } from '../../services/visible-train-workspace';
import { buildMobileVisiblePlanWorkspace } from '../../services/visible-plan-workspace';
import { createVisibleProgressWorkspace } from '../../services/visible-progress-workspace';
import { createVisibleYouWorkspace } from '../../services/visible-you-workspace';
import { SideQuestWorkspaceShell } from './SideQuestWorkspaceShell';

export interface SideQuestCanonicalWorkspaceModels {
  today: TodayWorkspaceModel;
  train: TrainWorkspaceModel;
  plan: PlanWorkspaceModel;
  progress: ProgressWorkspaceModel;
  you: YouWorkspaceModel;
}

export interface SideQuestWorkspaceRootHandlers {
  today: (action: V29TodayAction) => void;
  train: (action: V29TrainAction) => void;
  plan?: (action: V29PlanAction) => void;
  progress?: (action: V29ProgressAction) => void;
  you?: (action: V29YouAction) => void;
  header?: (action: 'inbox' | 'search' | 'profile' | 'none') => void;
  resumeWorkout?: (workoutId: string) => void;
  tabChanged?: (tab: SideQuestPrimaryTab) => void;
}

export interface SideQuestWorkspaceRootProps {
  canonical: SideQuestCanonicalWorkspaceModels;
  handlers: SideQuestWorkspaceRootHandlers;
  initialTab?: SideQuestPrimaryTab;
  activeTab?: SideQuestPrimaryTab;
  activeWorkout?: Omit<SideQuestActiveWorkoutBar, 'resumeLabel' | 'visibleAcrossTabs'>;
  contextLabel?: string;
  phaseContext?: string;
  unresolvedAttentionCount?: number;
  workoutPlayerOpen?: boolean;
}

export function SideQuestWorkspaceRoot({
  canonical,
  handlers,
  initialTab = 'today',
  activeTab: controlledActiveTab,
  activeWorkout,
  contextLabel,
  phaseContext,
  unresolvedAttentionCount,
  workoutPlayerOpen = false,
}: SideQuestWorkspaceRootProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<SideQuestPrimaryTab>(initialTab);
  const activeTab = controlledActiveTab ?? internalActiveTab;

  const shell = useMemo(
    () => buildMobileShellState({
      routeName: activeTab,
      activeWorkout,
      contextLabel,
      unresolvedAttentionCount,
      workoutPlayerOpen,
    }),
    [activeTab, activeWorkout, contextLabel, unresolvedAttentionCount, workoutPlayerOpen],
  );

  const models = useMemo(
    () => ({
      today: buildMobileVisibleTodayScreen({ workspace: canonical.today, phaseContext }),
      train: buildMobileVisibleTrainWorkspace(canonical.train),
      plan: buildMobileVisiblePlanWorkspace(canonical.plan),
      progress: createVisibleProgressWorkspace(canonical.progress),
      you: createVisibleYouWorkspace(canonical.you),
    }),
    [canonical, phaseContext],
  );

  const changeTab = (tab: SideQuestPrimaryTab) => {
    if (controlledActiveTab === undefined) setInternalActiveTab(tab);
    handlers.tabChanged?.(tab);
  };

  return (
    <SideQuestWorkspaceShell
      shell={shell}
      models={models}
      handlers={{
        today: handlers.today,
        train: handlers.train,
        plan: handlers.plan,
        progress: handlers.progress,
        you: handlers.you,
      }}
      onTabChange={changeTab}
      onHeaderAction={handlers.header}
      onResumeWorkout={handlers.resumeWorkout}
    />
  );
}
