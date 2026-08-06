import type { YouWorkspaceModel, V29YouVisibleScreenModel } from '@circuit/domain';
import { assertVisibleYouWorkspace, buildVisibleYouWorkspace } from '@circuit/planner';

export function createVisibleYouWorkspace(source: YouWorkspaceModel): V29YouVisibleScreenModel {
  const model = buildVisibleYouWorkspace(source);
  assertVisibleYouWorkspace(model);
  return model;
}
