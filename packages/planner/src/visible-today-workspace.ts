import type {
  TodayWorkspaceModel,
  V29TodayAction,
  V29TodayVisibleScreenModel,
  V29TodayTone,
} from '@circuit/domain';

const action = (
  actionId: string,
  kind: V29TodayAction['kind'],
  label: string,
  primary = false,
): V29TodayAction => ({
  actionId,
  kind,
  label,
  primary,
  accessibilityLabel: label,
});

function heroTone(model: TodayWorkspaceModel): V29TodayTone {
  if (model.recommendation.state === 'decision_required') return 'attention';
  if (model.recommendation.state === 'rest_day') return 'recovery';
  if (model.recommendation.state === 'empty') return 'open';
  return 'standard';
}

export interface BuildVisibleTodayInput {
  workspace: TodayWorkspaceModel;
  phaseContext?: string;
  bottomNavigationHeight?: number;
}

export function buildVisibleTodayWorkspace(input: BuildVisibleTodayInput): V29TodayVisibleScreenModel {
  const { workspace } = input;
  const isOpen = workspace.recommendation.state === 'empty';
  const heroActions: V29TodayAction[] = isOpen
    ? [
        action('build-workout', 'build_workout', 'Build a workout', true),
        action('add-session', 'add_session', 'Add a session'),
        action('recovery-day', 'recovery_day', 'Take a recovery day'),
      ]
    : [
        ...(workspace.recommendation.canStart ? [action('start', 'start', 'Start workout', true)] : []),
        ...(workspace.recommendation.canEdit ? [action('edit', 'edit', 'Edit')] : []),
        ...(workspace.recommendation.canMove ? [action('move', 'move', 'Move')] : []),
        ...(workspace.recommendation.canReplace ? [action('replace', 'replace', 'Replace')] : []),
      ];

  const readinessTone: V29TodayTone = workspace.readiness.state === 'review'
    ? 'attention'
    : workspace.readiness.state === 'recover'
      ? 'recovery'
      : 'standard';

  const model: V29TodayVisibleScreenModel = {
    dateLabel: workspace.dateLabel,
    phaseContext: input.phaseContext,
    hero: {
      eyebrow: isOpen ? 'Open day' : "Today's session",
      title: workspace.recommendation.name,
      metaLine: workspace.recommendation.durationMinutes > 0
        ? `${workspace.recommendation.durationMinutes} min · ${workspace.recommendation.workoutType} · ${workspace.recommendation.timingLabel}`
        : workspace.recommendation.timingLabel,
      purpose: workspace.recommendation.whyToday || workspace.recommendation.purpose,
      tone: heroTone(workspace),
      actions: heroActions,
    },
    readiness: {
      title: workspace.readiness.title,
      interpretation: workspace.readiness.interpretation,
      tone: readinessTone,
      restrictionLabel: workspace.readiness.painOrRestriction,
      actions: [
        action('check-in', 'check_in', 'Feeling different?'),
        action('restriction', 'add_restriction', 'Add pain or restriction'),
      ],
    },
    timeline: workspace.timeline.map((item) => ({
      id: item.id,
      timeLabel: item.startLabel ?? 'Flexible',
      title: item.title,
      detail: [
        item.durationMinutes ? `${item.durationMinutes} min` : undefined,
        item.flexibility === 'protected' ? 'Protected commitment' : item.flexibility === 'flexible' ? 'Flexible' : 'Fixed time',
      ].filter(Boolean).join(' · '),
      statusLabel: item.conflict ? 'Conflict' : undefined,
      conflictMessage: item.conflictMessage,
      iconKey: item.kind,
    })),
    decision: workspace.coachingResponse
      ? {
          title: workspace.coachingResponse.summary,
          explanation: workspace.coachingResponse.trigger,
          tone: 'attention',
          actions: workspace.coachingResponse.options.map((option, index) =>
            action(
              option.id,
              index === 0 ? 'apply_adjustment' : option.label.toLowerCase().includes('original') ? 'keep_original' : 'view_reasoning',
              option.label,
              index === 0,
            ),
          ),
        }
      : undefined,
    upcoming: workspace.upcoming.slice(0, 2).map((day) => ({
      dayLabel: day.dateLabel,
      title: day.headline,
      detail: day.sessionCount === 0
        ? 'No sessions planned'
        : `${day.sessionCount} session${day.sessionCount === 1 ? '' : 's'} · ${day.totalMinutes} min`,
    })),
    screenReaderOrder: [
      'date',
      ...(workspace.readiness.state === 'review' ? ['readiness' as const, 'hero' as const] : ['hero' as const, 'readiness' as const]),
      'timeline',
      ...(workspace.coachingResponse ? ['decision' as const] : []),
      'upcoming',
    ],
    bottomInsetForNavigation: Math.max(76, input.bottomNavigationHeight ?? 76) + 20,
  };

  assertVisibleTodayWorkspace(model);
  return model;
}

export function assertVisibleTodayWorkspace(model: V29TodayVisibleScreenModel): void {
  if (!model.dateLabel.trim()) throw new Error('Visible Today requires a date label.');
  if (!model.hero.title.trim()) throw new Error('Visible Today requires a dominant session or open-day title.');
  if (model.hero.actions.length === 0) throw new Error('Today hero must expose a direct action.');
  if (!model.readiness.interpretation.trim()) throw new Error('Readiness must be interpreted directly on Today.');
  if (model.upcoming.length > 2) throw new Error('Today may preview at most two upcoming days.');
  if (model.timeline.some((row) => row.conflictMessage !== undefined && !row.conflictMessage.trim())) {
    throw new Error('Timeline conflicts require visible explanations.');
  }
}
