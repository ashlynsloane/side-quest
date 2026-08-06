import type {
  ProgressHistoryItem,
  ProgressMilestone,
  ProgressMovementTrend,
  ProgressRegionalStatus,
  ProgressWorkspaceModel,
  V29ProgressAction,
  V29ProgressActionKind,
  V29ProgressHistoryCard,
  V29ProgressMilestoneCard,
  V29ProgressMovementCard,
  V29ProgressRegionalCard,
  V29ProgressVisibleScreenModel,
} from '@circuit/domain';
import { assertProgressWorkspace, progressEmptyState, progressPrimaryMessage } from './progress-workspace';

export interface BuildVisibleProgressWorkspaceOptions {
  bottomNavigationInset?: number;
  regionalLimit?: number;
  historyLimit?: number;
}

function action(
  actionId: string,
  kind: V29ProgressActionKind,
  label: string,
  targetId?: string,
  primary = false,
): V29ProgressAction {
  return { actionId, kind, label, targetId, primary, accessibilityLabel: label };
}

function regionalState(status: ProgressRegionalStatus): Pick<V29ProgressRegionalCard, 'stateLabel' | 'tone'> {
  const states: Record<ProgressRegionalStatus['state'], Pick<V29ProgressRegionalCard, 'stateLabel' | 'tone'>> = {
    ready_to_progress: { stateLabel: 'Ready to progress', tone: 'progress' },
    on_plan: { stateLabel: 'On plan', tone: 'steady' },
    recently_trained: { stateLabel: 'Recently trained', tone: 'recent' },
    strength_opportunity: { stateLabel: 'Strength opportunity', tone: 'opportunity' },
    recover_before_loading: { stateLabel: 'Recover before loading', tone: 'recovery' },
    review_symptoms: { stateLabel: 'Review symptoms', tone: 'attention' },
  };
  return states[status.state];
}

function mapRegion(status: ProgressRegionalStatus): V29ProgressRegionalCard {
  const state = regionalState(status);
  return {
    regionId: status.regionId,
    regionLabel: status.regionLabel,
    stateLabel: state.stateLabel,
    interpretation: status.interpretation,
    nextStep: status.nextStep,
    sportLine: status.relatedSportLabels.length > 0 ? status.relatedSportLabels.join(' · ') : undefined,
    tone: state.tone,
    actions: [action(`region-${status.regionId}`, 'open_region', 'View region', status.regionId)],
  };
}

function movementDirection(trend: ProgressMovementTrend): string {
  const labels: Record<ProgressMovementTrend['direction'], string> = {
    improving: 'Building',
    stable: 'Maintained',
    building: 'Building',
    recovering: 'Returning',
    insufficient_data: 'Learning',
  };
  return labels[trend.direction];
}

function mapMovement(trend: ProgressMovementTrend): V29ProgressMovementCard {
  return {
    movementId: trend.movementId,
    movementLabel: trend.movementLabel,
    directionLabel: movementDirection(trend),
    summary: trend.summary,
    evidenceLabel: trend.evidenceCount === 1 ? '1 relevant session' : `${trend.evidenceCount} relevant sessions`,
    latestValueLabel: trend.latestValueLabel,
    nextProgression: trend.nextProgression,
    actions: [action(`movement-${trend.movementId}`, 'open_movement', 'View movement', trend.movementId)],
  };
}

function historyStatus(item: ProgressHistoryItem): string {
  const labels: Record<ProgressHistoryItem['status'], string> = {
    completed: 'Completed',
    partial: 'Partially completed',
    modified: 'Modified appropriately',
    stopped: 'Stopped',
  };
  return labels[item.status];
}

function mapHistory(item: ProgressHistoryItem): V29ProgressHistoryCard {
  return {
    workoutId: item.workoutId,
    name: item.name,
    completedAtLabel: item.completedAtLabel,
    detail: `${item.durationMinutes} min · ${item.focusLabel}`,
    statusLabel: historyStatus(item),
    note: item.note,
    actions: [
      action(`history-${item.workoutId}`, 'open_workout', 'View', item.workoutId),
      ...(item.canRepeat && item.status !== 'stopped'
        ? [action(`repeat-${item.workoutId}`, 'repeat_workout', 'Repeat', item.workoutId, true)]
        : []),
    ],
  };
}

function milestoneCategory(item: ProgressMilestone): string {
  const labels: Record<ProgressMilestone['kind'], string> = {
    first: 'Experience',
    progression: 'Performance',
    return: 'Recovery',
    block: 'Training block',
    personal: 'Decision quality',
  };
  return labels[item.kind];
}

function mapMilestone(item: ProgressMilestone): V29ProgressMilestoneCard {
  return {
    milestoneId: item.milestoneId,
    categoryLabel: milestoneCategory(item),
    title: item.title,
    detail: item.detail,
    achievedAtLabel: item.achievedAtLabel,
  };
}

export function buildVisibleProgressWorkspace(
  model: ProgressWorkspaceModel,
  options: BuildVisibleProgressWorkspaceOptions = {},
): V29ProgressVisibleScreenModel {
  assertProgressWorkspace(model);
  const balanceSections = [
    { label: 'Substantial stimulus', items: model.trainingBalance.substantialStimulus },
    { label: 'Maintained', items: model.trainingBalance.maintained },
    { label: 'Opportunities', items: model.trainingBalance.opportunities },
    { label: 'Next emphasis', items: model.trainingBalance.nextEmphasis },
  ].filter((section) => section.items.length > 0);

  return {
    overview: {
      eyebrow: 'Training picture',
      title: model.headline,
      interpretation: model.interpretation,
      primaryMessage: progressPrimaryMessage(model),
    },
    regionalStatus: model.regionalStatus.slice(0, options.regionalLimit ?? 8).map(mapRegion),
    trainingWins: model.improvements.map((item) => ({
      improvementId: item.improvementId,
      title: item.title,
      explanation: item.explanation,
      occurredAtLabel: item.occurredAtLabel,
    })),
    movementTrends: model.movementTrends.map(mapMovement),
    trainingBalance: {
      summary: model.trainingBalance.summary,
      sections: balanceSections,
      actions: [action('open-training-balance', 'open_training_balance', 'View training balance')],
    },
    recentHistory: model.recentHistory.slice(0, options.historyLimit ?? 6).map(mapHistory),
    milestones: model.milestones.map(mapMilestone),
    emptyState: progressEmptyState(model),
    screenReaderOrder: ['overview', 'regional_status', 'training_wins', 'movement_trends', 'training_balance', 'history', 'milestones'],
    bottomInsetForNavigation: options.bottomNavigationInset ?? 104,
  };
}
