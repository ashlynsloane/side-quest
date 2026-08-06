import type { PlanWorkspaceModel } from '@circuit/domain';
import { assertPlanWorkspace, planEmptyState, planSportMinutes, planWeekMinutes } from '@circuit/planner';

export type PlanSectionKey = 'phase' | 'week' | 'alerts' | 'controls' | 'roadmap';

export interface MobilePlanSection {
  key: PlanSectionKey;
  title: string;
  visible: boolean;
  itemCount: number;
}

export interface MobilePlanScreenModel {
  workspace: PlanWorkspaceModel;
  sections: MobilePlanSection[];
  totalMinutes: number;
  sportMinutes: ReturnType<typeof planSportMinutes>;
  emptyState?: string;
  firstActionableAlertId?: string;
}

export function buildMobilePlanScreen(model: PlanWorkspaceModel): MobilePlanScreenModel {
  assertPlanWorkspace(model);
  return {
    workspace: model,
    sections: [
      { key: 'phase', title: 'Current phase', visible: true, itemCount: 1 },
      { key: 'week', title: 'This week', visible: true, itemCount: model.days.length },
      { key: 'alerts', title: 'Needs attention', visible: model.alerts.length > 0, itemCount: model.alerts.length },
      { key: 'controls', title: 'Adjust plan', visible: model.controls.length > 0, itemCount: model.controls.length },
      { key: 'roadmap', title: 'Roadmap', visible: model.roadmap.length > 0, itemCount: model.roadmap.length },
    ],
    totalMinutes: planWeekMinutes(model),
    sportMinutes: planSportMinutes(model),
    emptyState: planEmptyState(model),
    firstActionableAlertId: model.alerts.find((alert) => alert.actions.length > 0)?.alertId,
  };
}
