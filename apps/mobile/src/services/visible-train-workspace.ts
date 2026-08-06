import type { TrainWorkspaceModel, V29TrainVisibleScreenModel } from '@circuit/domain';
import { assertVisibleTrainWorkspace, buildVisibleTrainWorkspace } from '@circuit/planner';

export function buildMobileVisibleTrainWorkspace(
  workspace: TrainWorkspaceModel,
  bottomInsetForNavigation = 112,
): V29TrainVisibleScreenModel {
  const model = buildVisibleTrainWorkspace({ workspace, bottomInsetForNavigation });
  assertVisibleTrainWorkspace(model);
  return model;
}
