import type { TodayWorkspaceModel, V29TodayVisibleScreenModel } from '@circuit/domain';
import { buildVisibleTodayWorkspace } from '@circuit/planner';

export interface MobileVisibleTodayInput {
  workspace: TodayWorkspaceModel;
  phaseContext?: string;
}

export function buildMobileVisibleTodayScreen(input: MobileVisibleTodayInput): V29TodayVisibleScreenModel {
  return buildVisibleTodayWorkspace({
    workspace: input.workspace,
    phaseContext: input.phaseContext,
    bottomNavigationHeight: 76,
  });
}
