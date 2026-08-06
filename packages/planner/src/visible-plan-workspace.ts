import type {
  PlanAlert,
  PlanControl,
  PlanRoadmapBlock,
  PlanSession,
  PlanWorkspaceModel,
  V29PlanAction,
  V29PlanActionKind,
  V29PlanAlertCard,
  V29PlanDayCard,
  V29PlanRoadmapCard,
  V29PlanSessionRow,
  V29PlanVisibleScreenModel,
} from '@circuit/domain';
import { assertPlanWorkspace, planEmptyState, planSportMinutes, planWeekMinutes } from './plan-workspace';

export interface BuildVisiblePlanWorkspaceOptions {
  bottomNavigationInset?: number;
  visibleDayLimit?: number;
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return 'No training time scheduled';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} min scheduled`;
  if (remainder === 0) return `${hours} hr scheduled`;
  return `${hours} hr ${remainder} min scheduled`;
}

function action(
  actionId: string,
  kind: V29PlanActionKind,
  label: string,
  primary = false,
): V29PlanAction {
  return {
    actionId,
    kind,
    label,
    primary,
    accessibilityLabel: label,
  };
}

function sessionStatusLabel(session: PlanSession): string {
  const labels: Record<PlanSession['status'], string> = {
    planned: 'Planned',
    completed: 'Completed',
    missed: 'Needs review',
    moved: 'Moved',
    proposed: 'Proposed change',
  };
  return labels[session.status];
}

function sessionTone(session: PlanSession): V29PlanSessionRow['tone'] {
  if (session.status === 'completed') return 'completed';
  if (session.status === 'missed') return 'attention';
  if (session.status === 'proposed') return 'proposed';
  return 'standard';
}

function mapSession(session: PlanSession): V29PlanSessionRow {
  const detailParts = [
    `${session.durationMinutes} min`,
    session.purposeLabel,
    session.intensityLabel,
    session.locationLabel,
  ].filter((value): value is string => Boolean(value));
  return {
    sessionId: session.sessionId,
    sport: session.sport,
    title: session.title,
    detail: detailParts.join(' · '),
    timeLabel: session.timeLabel,
    statusLabel: sessionStatusLabel(session),
    priorityLabel: session.isPriority ? 'Priority session' : undefined,
    tone: sessionTone(session),
    actions: [
      action(`open-${session.sessionId}`, 'open_session', 'View'),
      ...(session.status === 'planned' || session.status === 'proposed'
        ? [
            action(`move-${session.sessionId}`, 'move_session', 'Move'),
            action(`edit-${session.sessionId}`, 'edit_session', 'Edit'),
          ]
        : []),
    ],
  };
}

function mapAlert(alert: PlanAlert): V29PlanAlertCard {
  return {
    alertId: alert.alertId,
    title: alert.title,
    explanation: alert.explanation,
    tone: alert.severity,
    actions: alert.actions.map((item, index) =>
      action(`${alert.alertId}-${item.actionId}`, 'resolve_alert', item.label, index === 0),
    ),
  };
}

function controlKind(control: PlanControl): V29PlanActionKind {
  const known: Record<string, V29PlanActionKind> = {
    availability: 'adjust_availability',
    emphasis: 'change_emphasis',
    event: 'add_event',
    commitment: 'add_commitment',
  };
  return known[control.controlId] ?? 'change_emphasis';
}

function mapRoadmap(block: PlanRoadmapBlock): V29PlanRoadmapCard {
  const stateLabels: Record<PlanRoadmapBlock['state'], string> = {
    completed: 'Completed',
    current: 'Current block',
    upcoming: 'Upcoming',
  };
  return {
    blockId: block.blockId,
    title: block.title,
    dateRangeLabel: block.dateRangeLabel,
    emphasis: block.emphasis,
    stateLabel: stateLabels[block.state],
    current: block.state === 'current',
    actions: [action(`roadmap-${block.blockId}`, 'open_roadmap', 'View block')],
  };
}

export function buildVisiblePlanWorkspace(
  model: PlanWorkspaceModel,
  options: BuildVisiblePlanWorkspaceOptions = {},
): V29PlanVisibleScreenModel {
  assertPlanWorkspace(model);
  const sportMinutes = planSportMinutes(model);
  const sportSummary = (Object.entries(sportMinutes) as Array<[keyof typeof sportMinutes, number]>)
    .filter(([, minutes]) => minutes > 0)
    .map(([sport, minutes]) => `${sport[0]?.toUpperCase()}${sport.slice(1)} ${minutes} min`);
  const goalLine = [model.phase.goalLabel, model.phase.goalDateLabel].filter(Boolean).join(' · ') || undefined;
  const days: V29PlanDayCard[] = model.days.slice(0, options.visibleDayLimit ?? 7).map((day) => ({
    dateKey: day.dateKey,
    dayLabel: day.dayLabel,
    dateLabel: day.dateLabel,
    isToday: day.isToday,
    commitmentLabels: day.commitments.map((commitment) =>
      [commitment.title, commitment.timeLabel, commitment.protected ? 'Protected' : undefined]
        .filter(Boolean)
        .join(' · '),
    ),
    sessions: day.sessions.map(mapSession),
    emptyMessage: day.sessions.length === 0 ? 'Open training day' : undefined,
  }));

  return {
    phase: {
      eyebrow: 'Current phase',
      title: model.phase.title,
      weekLabel: model.phase.weekLabel,
      objective: model.phase.objective,
      goalLine,
    },
    weekLabel: 'This week',
    totalTimeLabel: formatMinutes(planWeekMinutes(model)),
    sportSummary,
    days,
    alerts: model.alerts.map(mapAlert),
    controls: model.controls.map((control) =>
      action(`control-${control.controlId}`, controlKind(control), control.label),
    ),
    roadmap: model.roadmap.map(mapRoadmap),
    emptyState: planEmptyState(model),
    screenReaderOrder: ['phase', 'alerts', 'week', 'controls', 'roadmap'],
    bottomInsetForNavigation: options.bottomNavigationInset ?? 104,
  };
}
