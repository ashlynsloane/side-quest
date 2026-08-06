import type { ProgressWorkspaceModel, V29ProgressVisibleScreenModel } from '@circuit/domain';
import { buildVisibleProgressWorkspace } from '@circuit/planner';

export function createVisibleProgressWorkspace(model: ProgressWorkspaceModel): V29ProgressVisibleScreenModel {
  return buildVisibleProgressWorkspace(model);
}
