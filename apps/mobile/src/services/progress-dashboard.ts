import type { RegionalStatusResult } from '@circuit/planner';

import { getRegionalStrengthStatusSnapshot } from './regional-status';
import { loadTrainingHistory, type TrainingHistoryItem } from './training-history';

export type ProgressWindowDays = 14 | 28;

export interface ProgressDashboardRecentItem {
  id: string;
  kind: 'strength' | 'endurance';
  routeId: string;
  title: string;
  typeLabel: string;
  dateLabel: string;
  durationMinutes: number;
  needsReview: boolean;
}

export interface ProgressDashboardRegionItem {
  region: RegionalStatusResult['region'];
  regionLabel: string;
  state: RegionalStatusResult['status'];
  stateLabel: string;
  detail: string;
  recommendation: string;
  warning: boolean;
}

export interface ProgressDashboardData {
  windowDays: ProgressWindowDays;
  trainingDays: number;
  sessions: number;
  strengthSessions: number;
  enduranceSessions: number;
  totalMinutes: number;
  previousSessions: number;
  reviewCount: number;
  onPlanCount: number;
  opportunityCount: number;
  primaryMessage: string;
  secondaryMessage: string;
  comparisonMessage: string;
  recent: ProgressDashboardRecentItem[];
  regionalPriorities: ProgressDashboardRegionItem[];
}

export async function loadProgressDashboard(windowDays: ProgressWindowDays): Promise<ProgressDashboardData> {
  const now = new Date();
  const [history, regional] = await Promise.all([
    loadTrainingHistory(500),
    getRegionalStrengthStatusSnapshot(now, windowDays),
  ]);

  const nowMs = now.getTime();
  const spanMs = windowDays * 86_400_000;
  const currentStart = nowMs - spanMs;
  const previousStart = nowMs - (spanMs * 2);
  const usable = history.filter(countsAsTraining);
  const current = usable.filter((item) => {
    const timestamp = Date.parse(item.occurredAt);
    return Number.isFinite(timestamp) && timestamp >= currentStart && timestamp <= nowMs;
  });
  const previous = usable.filter((item) => {
    const timestamp = Date.parse(item.occurredAt);
    return Number.isFinite(timestamp) && timestamp >= previousStart && timestamp < currentStart;
  });

  const strengthSessions = current.filter((item) => item.kind === 'strength').length;
  const enduranceSessions = current.filter((item) => item.kind === 'endurance').length;
  const trainingDays = new Set(current.map((item) => localDate(new Date(item.occurredAt)))).size;
  const totalMinutes = Math.round(current.reduce((sum, item) => sum + durationMinutes(item), 0));

  const reviewRegions = regional.regions.filter((item) => item.status === 'restricted' || item.status === 'review_before_loading');
  const opportunityRegions = regional.regions.filter((item) => item.status === 'strength_opportunity' || item.status === 'sport_loaded_strength_needed');
  const onPlanRegions = regional.regions.filter((item) => item.status === 'on_plan' || item.status === 'recently_loaded');

  const regionalPriorities = [...reviewRegions, ...opportunityRegions]
    .slice(0, 5)
    .map((item) => ({
      region: item.region,
      regionLabel: formatRegion(item.region),
      state: item.status,
      stateLabel: item.statusLabel,
      detail: item.coverageLabel,
      recommendation: item.recommendation,
      warning: Boolean(item.warning),
    }));

  return {
    windowDays,
    trainingDays,
    sessions: current.length,
    strengthSessions,
    enduranceSessions,
    totalMinutes,
    previousSessions: previous.length,
    reviewCount: reviewRegions.length,
    onPlanCount: onPlanRegions.length,
    opportunityCount: opportunityRegions.length,
    primaryMessage: primaryMessage({ sessions: current.length, reviewCount: reviewRegions.length, trainingDays }),
    secondaryMessage: secondaryMessage({
      sessions: current.length,
      opportunityCount: opportunityRegions.length,
      onPlanCount: onPlanRegions.length,
    }),
    comparisonMessage: comparisonMessage(current.length, previous.length, windowDays),
    recent: current.slice(0, 5).map(toRecentItem),
    regionalPriorities,
  };
}

function countsAsTraining(item: TrainingHistoryItem): boolean {
  if (item.kind === 'strength') return item.workout.completionFraction >= 0.25;
  return !item.activity.deletedAt && item.activity.classification !== 'ignored';
}

function durationMinutes(item: TrainingHistoryItem): number {
  if (item.kind === 'endurance') return Math.max(0, item.activity.movingTimeSeconds / 60);
  const elapsed = (Date.parse(item.workout.completedAt) - Date.parse(item.workout.startedAt)) / 60_000;
  return Number.isFinite(elapsed) ? Math.max(0, Math.min(elapsed, 360)) : 0;
}

function toRecentItem(item: TrainingHistoryItem): ProgressDashboardRecentItem {
  if (item.kind === 'strength') {
    return {
      id: item.id,
      kind: 'strength',
      routeId: item.workout.id,
      title: item.workout.name,
      typeLabel: 'Strength',
      dateLabel: formatDate(item.occurredAt),
      durationMinutes: Math.round(durationMinutes(item)),
      needsReview: item.needsReview,
    };
  }
  return {
    id: item.id,
    kind: 'endurance',
    routeId: item.activity.id,
    title: item.activity.name,
    typeLabel: disciplineLabel(item.activity.discipline),
    dateLabel: formatDate(item.occurredAt),
    durationMinutes: Math.round(durationMinutes(item)),
    needsReview: item.needsReview,
  };
}

function primaryMessage(input: { sessions: number; reviewCount: number; trainingDays: number }): string {
  if (input.reviewCount > 0) {
    return `${input.reviewCount} region${input.reviewCount === 1 ? '' : 's'} need review before additional loading.`;
  }
  if (input.sessions === 0) return 'Complete a session to start building a useful progress picture.';
  return `Your recent training is informing progression decisions across ${input.trainingDays} training day${input.trainingDays === 1 ? '' : 's'}.`;
}

function secondaryMessage(input: { sessions: number; opportunityCount: number; onPlanCount: number }): string {
  if (input.sessions === 0) return 'Side Quest will use completed strength, imported endurance, and regional context as evidence—not as a score.';
  if (input.opportunityCount > 0) {
    return `${input.opportunityCount} region${input.opportunityCount === 1 ? '' : 's'} currently look like strength opportunities. These are plan-relative, not universal muscle targets.`;
  }
  if (input.onPlanCount > 0) {
    return `${input.onPlanCount} region${input.onPlanCount === 1 ? '' : 's'} are currently on plan or recently loaded.`;
  }
  return 'Keep training normally while Side Quest collects enough repeated evidence to make progression more specific.';
}

function comparisonMessage(current: number, previous: number, windowDays: number): string {
  if (current === previous) return `${current} sessions in both ${windowDays}-day windows. Side Quest does not reward volume for its own sake.`;
  if (current > previous) return `${previous} → ${current} sessions versus the previous ${windowDays} days. More volume is context, not automatically better.`;
  return `${previous} → ${current} sessions versus the previous ${windowDays} days. Lower volume is not treated as training debt.`;
}

function disciplineLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatRegion(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace('Gastrocnemius', 'Calves')
    .replace('Hip Abductors', 'Lateral Hips');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(value));
}

function localDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
