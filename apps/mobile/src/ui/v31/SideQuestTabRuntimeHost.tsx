import React from 'react';
import type { SideQuestPrimaryTab } from '@circuit/domain';
import type { SideQuestLiveRuntimeProps } from './SideQuestLiveRuntime';
import { SideQuestLiveRuntime } from './SideQuestLiveRuntime';

export interface SideQuestTabRuntimeHostProps extends Omit<SideQuestLiveRuntimeProps, 'routeName' | 'fallbackTab'> {
  tab: SideQuestPrimaryTab;
}

export function SideQuestTabRuntimeHost({ tab, ...props }: SideQuestTabRuntimeHostProps) {
  return <SideQuestLiveRuntime {...props} routeName={tab} fallbackTab={tab} />;
}

export const TodayRuntimeHost = (props: Omit<SideQuestTabRuntimeHostProps, 'tab'>) =>
  <SideQuestTabRuntimeHost {...props} tab="today" />;
export const TrainRuntimeHost = (props: Omit<SideQuestTabRuntimeHostProps, 'tab'>) =>
  <SideQuestTabRuntimeHost {...props} tab="train" />;
export const PlanRuntimeHost = (props: Omit<SideQuestTabRuntimeHostProps, 'tab'>) =>
  <SideQuestTabRuntimeHost {...props} tab="plan" />;
export const ProgressRuntimeHost = (props: Omit<SideQuestTabRuntimeHostProps, 'tab'>) =>
  <SideQuestTabRuntimeHost {...props} tab="progress" />;
export const YouRuntimeHost = (props: Omit<SideQuestTabRuntimeHostProps, 'tab'>) =>
  <SideQuestTabRuntimeHost {...props} tab="you" />;
