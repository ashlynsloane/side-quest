import type { TrainWorkspaceModel } from '@circuit/domain';
import { assertTrainWorkspace, trainPrimaryActionLabel } from '@circuit/planner';

export type TrainSectionKey = 'active' | 'builder' | 'recommended' | 'saved' | 'together';

export interface MobileTrainSection {
  key: TrainSectionKey;
  title: string;
  visible: boolean;
  itemCount: number;
}

export interface MobileTrainScreenModel {
  workspace: TrainWorkspaceModel;
  sections: MobileTrainSection[];
  primaryActionLabel: string;
  suppressStandardHero: boolean;
}

export function buildMobileTrainScreen(model: TrainWorkspaceModel): MobileTrainScreenModel {
  assertTrainWorkspace(model);
  return {
    workspace: model,
    sections: [
      { key: 'active', title: 'Active workout', visible: Boolean(model.activeWorkout), itemCount: model.activeWorkout ? 1 : 0 },
      { key: 'builder', title: 'Start a Side Quest', visible: true, itemCount: 1 },
      { key: 'recommended', title: 'Recommended for you', visible: model.recommended.length > 0, itemCount: model.recommended.length },
      { key: 'saved', title: 'Saved and recent', visible: model.savedAndRecent.length > 0, itemCount: model.savedAndRecent.length },
      { key: 'together', title: 'Workout Together', visible: Boolean(model.workoutTogether), itemCount: model.workoutTogether ? 1 : 0 },
    ],
    primaryActionLabel: trainPrimaryActionLabel(model),
    suppressStandardHero: Boolean(model.activeWorkout),
  };
}
