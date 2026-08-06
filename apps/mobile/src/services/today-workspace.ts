import type { TodayWorkspaceModel } from '@circuit/domain';
import { assertTodayWorkspace, todayNeedsAttention } from '@circuit/planner';

export type TodaySectionKey = 'recommendation' | 'readiness' | 'timeline' | 'coaching' | 'upcoming';

export interface MobileTodaySection {
  key: TodaySectionKey;
  title: string;
  visible: boolean;
  itemCount: number;
}

export interface MobileTodayScreenModel {
  workspace: TodayWorkspaceModel;
  sections: MobileTodaySection[];
  showInboxBadge: boolean;
  needsAttention: boolean;
  primaryActionLabel: string;
}

export function buildMobileTodayScreen(model: TodayWorkspaceModel): MobileTodayScreenModel {
  assertTodayWorkspace(model);
  return {
    workspace: model,
    sections: [
      { key: 'recommendation', title: "Today's recommendation", visible: true, itemCount: 1 },
      { key: 'readiness', title: 'Readiness', visible: true, itemCount: 1 },
      { key: 'timeline', title: 'Your day', visible: model.timeline.length > 0, itemCount: model.timeline.length },
      { key: 'coaching', title: 'What changed', visible: Boolean(model.coachingResponse), itemCount: model.coachingResponse ? 1 : 0 },
      { key: 'upcoming', title: 'Coming up', visible: model.upcoming.length > 0, itemCount: model.upcoming.length },
    ],
    showInboxBadge: model.unresolvedInboxCount > 0,
    needsAttention: todayNeedsAttention(model),
    primaryActionLabel: model.recommendation.canStart ? 'Start workout' : 'Choose a workout',
  };
}
