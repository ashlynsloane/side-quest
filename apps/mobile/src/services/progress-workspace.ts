import type { ProgressWorkspaceModel } from '@circuit/domain';
import {
  assertProgressWorkspace,
  progressEmptyState,
  progressPrimaryMessage,
  repeatableProgressWorkouts,
} from '@circuit/planner';

export type ProgressSectionKey =
  | 'regional_status'
  | 'improvements'
  | 'movement_trends'
  | 'training_balance'
  | 'history'
  | 'milestones';

export interface MobileProgressSection {
  key: ProgressSectionKey;
  title: string;
  visible: boolean;
  itemCount: number;
}

export interface MobileProgressScreenModel {
  workspace: ProgressWorkspaceModel;
  primaryMessage: string;
  sections: MobileProgressSection[];
  repeatableWorkoutIds: string[];
  emptyState?: string;
}

export function buildMobileProgressScreen(model: ProgressWorkspaceModel): MobileProgressScreenModel {
  assertProgressWorkspace(model);
  return {
    workspace: model,
    primaryMessage: progressPrimaryMessage(model),
    sections: [
      { key: 'regional_status', title: 'Regional status', visible: model.regionalStatus.length > 0, itemCount: model.regionalStatus.length },
      { key: 'improvements', title: 'Recent improvements', visible: model.improvements.length > 0, itemCount: model.improvements.length },
      { key: 'movement_trends', title: 'Strength progression', visible: model.movementTrends.length > 0, itemCount: model.movementTrends.length },
      { key: 'training_balance', title: 'Training balance', visible: true, itemCount: 1 },
      { key: 'history', title: 'Recent workouts', visible: model.recentHistory.length > 0, itemCount: model.recentHistory.length },
      { key: 'milestones', title: 'Milestones', visible: model.milestones.length > 0, itemCount: model.milestones.length },
    ],
    repeatableWorkoutIds: repeatableProgressWorkouts(model).map((workout) => workout.workoutId),
    emptyState: progressEmptyState(model),
  };
}
