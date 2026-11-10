import type { TrainingEvent } from './daily-training-guardrails';

export type TrainingUrgeReason = 'energy' | 'faster_progress' | 'restless';
export type TrainingUrgeActivity = 'calf' | 'cycling' | 'strength' | 'walking' | 'other';

export interface TrainingUrgeSummary {
  recordedUrges: number;
  activities: Partial<Record<TrainingUrgeActivity, number>>;
  reasons: Partial<Record<TrainingUrgeReason, number>>;
  mostFrequentReason?: TrainingUrgeReason;
}

/**
 * A recorded desire to train is a behavioral observation, never completed
 * exercise or evidence of training capacity. Counts are descriptive only.
 */
export function summarizeTrainingUrges(events: readonly TrainingEvent[]): TrainingUrgeSummary {
  const activities: Partial<Record<TrainingUrgeActivity, number>> = {};
  const reasons: Partial<Record<TrainingUrgeReason, number>> = {};
  let recordedUrges = 0;
  for (const event of events) {
    if (event.kind !== 'urge' || !event.note) continue;
    let data: unknown;
    try { data = JSON.parse(event.note); } catch { continue; }
    if (!data || typeof data !== 'object') continue;
    const { category, activityConsidered, reason } = data as Record<string, unknown>;
    if (category !== 'post_workout_add_more') continue;
    recordedUrges += 1;
    if (typeof activityConsidered === 'string' &&
        ['calf','cycling','strength','walking','other'].includes(activityConsidered)) {
      const a = activityConsidered as TrainingUrgeActivity;
      activities[a] = (activities[a] ?? 0) + 1;
    }
    if (typeof reason === 'string' &&
        ['energy','faster_progress','restless'].includes(reason)) {
      const r = reason as TrainingUrgeReason;
      reasons[r] = (reasons[r] ?? 0) + 1;
    }
  }
  const mostFrequentReason = (Object.entries(reasons) as Array<[TrainingUrgeReason, number]>)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  return { recordedUrges, activities, reasons, mostFrequentReason };
}
