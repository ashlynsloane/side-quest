import type { PlanWorkspaceModel, V29PlanVisibleScreenModel } from '@circuit/domain';
import { buildVisiblePlanWorkspace } from '@circuit/planner';

export function buildMobileVisiblePlanWorkspace(
  workspace: PlanWorkspaceModel,
  bottomNavigationInset = 104,
): V29PlanVisibleScreenModel {
  return buildVisiblePlanWorkspace(workspace, { bottomNavigationInset });
}
