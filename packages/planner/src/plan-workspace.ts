import type {
  PlanAlert,
  PlanControl,
  PlanDay,
  PlanPhaseSummary,
  PlanRoadmapBlock,
  PlanSession,
  PlanWorkspaceModel,
} from '@circuit/domain';

export interface BuildPlanWorkspaceInput {
  phase: PlanPhaseSummary;
  days?: PlanDay[];
  alerts?: PlanAlert[];
  controls?: PlanControl[];
  roadmap?: PlanRoadmapBlock[];
}

const defaultControls = (): PlanControl[] => [
  { controlId: 'availability', label: 'Adjust weekly availability', presentation: 'bottom_sheet' },
  { controlId: 'emphasis', label: 'Change training emphasis', presentation: 'bottom_sheet' },
  { controlId: 'event', label: 'Add race or event', presentation: 'modal' },
  { controlId: 'commitment', label: 'Add protected commitment', presentation: 'modal' },
];

export function buildPlanWorkspace(input: BuildPlanWorkspaceInput): PlanWorkspaceModel {
  return {
    phase: input.phase,
    days: (input.days ?? []).slice(0, 14),
    alerts: sortPlanAlerts(input.alerts ?? []).slice(0, 6),
    controls: (input.controls ?? defaultControls()).slice(0, 6),
    roadmap: (input.roadmap ?? []).slice(0, 6),
  };
}

export function sortPlanAlerts(alerts: PlanAlert[]): PlanAlert[] {
  const priority: Record<PlanAlert['severity'], number> = { high: 0, attention: 1, info: 2 };
  return [...alerts].sort((a, b) => priority[a.severity] - priority[b.severity]);
}

export function planWeekMinutes(model: PlanWorkspaceModel): number {
  return model.days.reduce(
    (total, day) => total + day.sessions.reduce((dayTotal, session) => dayTotal + session.durationMinutes, 0),
    0,
  );
}

export function planSportMinutes(model: PlanWorkspaceModel): Record<PlanSession['sport'], number> {
  const totals: Record<PlanSession['sport'], number> = {
    swim: 0,
    bike: 0,
    run: 0,
    strength: 0,
    recovery: 0,
    rest: 0,
    other: 0,
  };
  for (const day of model.days) {
    for (const session of day.sessions) totals[session.sport] += session.durationMinutes;
  }
  return totals;
}

export function planEmptyState(model: PlanWorkspaceModel): string | undefined {
  if (model.days.some((day) => day.sessions.length > 0)) return undefined;
  return 'Your week is open. Add your availability or build a plan around your next goal.';
}

export function assertPlanWorkspace(model: PlanWorkspaceModel): void {
  if (!model.phase.title.trim()) throw new Error('Plan phase requires a title.');
  if (!model.phase.weekLabel.trim()) throw new Error('Plan phase requires a week label.');
  if (!model.phase.objective.trim()) throw new Error('Plan phase requires an objective.');
  const dateKeys = new Set<string>();
  const sessionIds = new Set<string>();
  for (const day of model.days) {
    if (dateKeys.has(day.dateKey)) throw new Error(`Duplicate Plan day: ${day.dateKey}`);
    dateKeys.add(day.dateKey);
    for (const session of day.sessions) {
      if (sessionIds.has(session.sessionId)) throw new Error(`Duplicate Plan session: ${session.sessionId}`);
      sessionIds.add(session.sessionId);
      if (session.durationMinutes < 0 || !Number.isFinite(session.durationMinutes)) {
        throw new Error(`Plan session ${session.sessionId} has an invalid duration.`);
      }
      if (!session.title.trim() || !session.purposeLabel.trim()) {
        throw new Error(`Plan session ${session.sessionId} requires a title and purpose.`);
      }
    }
  }
  for (const alert of model.alerts) {
    if (!alert.explanation.trim()) throw new Error(`Plan alert ${alert.alertId} requires an explanation.`);
    if (alert.actions.length === 0) throw new Error(`Plan alert ${alert.alertId} requires a resolution action.`);
  }
}
