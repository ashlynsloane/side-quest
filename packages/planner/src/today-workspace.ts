import type {
  TodayCoachingResponse,
  TodayReadinessSummary,
  TodayTimelineItem,
  TodayUpcomingDay,
  TodayWorkoutRecommendation,
  TodayWorkspaceModel,
} from '@circuit/domain';

export interface BuildTodayWorkspaceInput {
  dateLabel: string;
  athleteName?: string;
  recommendation?: TodayWorkoutRecommendation;
  readiness?: TodayReadinessSummary;
  timeline?: TodayTimelineItem[];
  coachingResponse?: TodayCoachingResponse;
  upcoming?: TodayUpcomingDay[];
  unresolvedInboxCount?: number;
}

const emptyRecommendation = (): TodayWorkoutRecommendation => ({
  id: 'today-empty',
  name: 'No workout scheduled',
  workoutType: 'Open day',
  durationMinutes: 0,
  purpose: 'Use the day for recovery or choose a workout that fits.',
  timingLabel: 'Flexible',
  equipmentLabel: 'None required',
  whyToday: 'There is no required training session on the plan today.',
  state: 'empty',
  canStart: false,
  canEdit: false,
  canMove: false,
  canReplace: true,
});

const defaultReadiness = (): TodayReadinessSummary => ({
  state: 'ready_as_planned',
  title: 'Ready as planned',
  interpretation: 'No new check-in information changes today’s recommendation.',
});

export function buildTodayWorkspace(input: BuildTodayWorkspaceInput): TodayWorkspaceModel {
  const timeline = [...(input.timeline ?? [])].sort((left, right) =>
    (left.startLabel ?? '99:99').localeCompare(right.startLabel ?? '99:99'),
  );
  return {
    dateLabel: input.dateLabel,
    greeting: input.athleteName ? `Today for ${input.athleteName}` : 'Your training today',
    recommendation: input.recommendation ?? emptyRecommendation(),
    readiness: input.readiness ?? defaultReadiness(),
    timeline,
    coachingResponse: input.coachingResponse,
    upcoming: (input.upcoming ?? []).slice(0, 2),
    unresolvedInboxCount: Math.max(0, input.unresolvedInboxCount ?? 0),
  };
}

export function todayNeedsAttention(model: TodayWorkspaceModel): boolean {
  return model.recommendation.state === 'decision_required'
    || model.readiness.state === 'review'
    || model.timeline.some((item) => item.conflict)
    || Boolean(model.coachingResponse?.requiresDecision);
}

export function assertTodayWorkspace(model: TodayWorkspaceModel): void {
  if (!model.dateLabel.trim()) throw new Error('Today workspace requires a date label.');
  if (!model.recommendation.name.trim()) throw new Error('Today recommendation requires a name.');
  if (model.recommendation.durationMinutes < 0) throw new Error('Recommendation duration cannot be negative.');
  if (model.coachingResponse && model.coachingResponse.options.length === 0) {
    throw new Error('A coaching response must provide at least one actionable option.');
  }
  for (const item of model.timeline) {
    if (item.conflict && !item.conflictMessage?.trim()) {
      throw new Error(`Timeline conflict ${item.id} requires an explanation.`);
    }
  }
}
