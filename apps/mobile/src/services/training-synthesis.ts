import type { EnduranceActivity, PlannedCompletedMatch, TrainingCalendarEvent } from '@circuit/domain';
import type { SportIconKind } from '@/components/sport-icon';
import type { TrainingHistoryItem } from './training-history';

export interface TrainingSignal {
  id: string;
  title: string;
  detail: string;
  tone: 'neutral' | 'good' | 'attention';
  route: '/training-history' | '/weekly-review' | '/insights' | '/adaptive-plan';
}

export function conciseSessionLabel(input: { discipline?: string; name?: string; title?: string; trainer?: boolean }): string {
  const raw = (input.name ?? input.title ?? '').trim();
  const discipline = input.discipline;
  if (discipline === 'swim') return /open water/i.test(raw) ? 'Open-water swim' : 'Swim';
  if (discipline === 'bike') return input.trainer || /virtual|trainer/i.test(raw) ? 'Trainer ride' : 'Ride';
  if (discipline === 'run') return /trail/i.test(raw) ? 'Trail run' : 'Run';
  if (discipline === 'strength') return 'Strength';
  if (discipline === 'hiit') return 'HIIT';
  return raw.replace(/^(swim|bike|run|other|x-train)\s*:\s*/i, '') || 'Training';
}

export function sportKind(discipline?: string): SportIconKind {
  if (discipline === 'swim' || discipline === 'bike' || discipline === 'run' || discipline === 'strength' || discipline === 'hiit') return discipline;
  return 'other';
}

export function sessionMeaning(activity: EnduranceActivity, match?: PlannedCompletedMatch): string {
  if (match?.status === 'ambiguous') return 'Review whether this replaced a planned session.';
  if (match?.status === 'matched') return 'Counted toward the planned session; no duplicate work added.';
  if (activity.discipline === 'hiit' || activity.discipline === 'strength') return 'Adds direct strength or conditioning load for the next planning decision.';
  if (activity.intensity === 'hard' || activity.intensity === 'race') return 'Hard training load; protect recovery before the next key session.';
  if (activity.discipline === 'run') return 'Adds impact exposure that should inform lower-body strength placement.';
  if (activity.discipline === 'swim') return 'Adds swim frequency without automatically displacing strength.';
  if (activity.discipline === 'bike') return 'Adds cycling load that should inform lower-body recovery.';
  return 'Recorded as context; no automatic plan change is required.';
}

export function buildTrainingSignals(items: TrainingHistoryItem[]): TrainingSignal[] {
  const recent = items.filter((item) => Date.parse(item.occurredAt) >= Date.now() - 14 * 86400000);
  const reviewCount = recent.filter((item) => item.needsReview).length;
  const strengthCount = recent.filter((item) => item.kind === 'strength' || (item.kind === 'endurance' && (item.activity.discipline === 'strength' || item.activity.discipline === 'hiit'))).length;
  const hardEndurance = recent.filter((item) => item.kind === 'endurance' && (item.activity.intensity === 'hard' || item.activity.intensity === 'race')).length;
  const runCount = recent.filter((item) => item.kind === 'endurance' && item.activity.discipline === 'run').length;
  const swimCount = recent.filter((item) => item.kind === 'endurance' && item.activity.discipline === 'swim').length;
  const signals: TrainingSignal[] = [];

  if (reviewCount > 0) signals.push({ id: 'review', title: `${reviewCount} record${reviewCount === 1 ? '' : 's'} need context`, detail: 'Confirm matches or classify external strength so future recommendations use the right load.', tone: 'attention', route: '/training-history' });
  if (strengthCount === 0) signals.push({ id: 'strength', title: 'No recent direct strength recorded', detail: 'Side Quest can preserve a minimum effective strength dose when you build or adjust the week.', tone: 'neutral', route: '/insights' });
  else signals.push({ id: 'strength', title: 'Strength is represented in recent training', detail: `${strengthCount} direct strength or HIIT session${strengthCount === 1 ? '' : 's'} in the last 14 days.`, tone: 'good', route: '/insights' });
  if (hardEndurance >= 3) signals.push({ id: 'hard', title: 'Several hard endurance sessions are close together', detail: 'Review spacing before adding another high-load strength or intensity day.', tone: 'attention', route: '/weekly-review' });
  else signals.push({ id: 'hard', title: 'Hard-session density is not elevated', detail: 'There is no automatic reason to remove strength based on recent intensity alone.', tone: 'good', route: '/weekly-review' });
  if (runCount === 0) signals.push({ id: 'run', title: 'No recent running detected', detail: 'Run capacity should be treated as unknown or rebuilding rather than inferred from older fitness.', tone: 'neutral', route: '/weekly-review' });
  if (swimCount > 0) signals.push({ id: 'swim', title: 'Swim frequency is established recently', detail: `${swimCount} swim session${swimCount === 1 ? '' : 's'} in the last 14 days.`, tone: 'good', route: '/weekly-review' });
  return signals.slice(0, 4);
}

export function eventMeaning(event: TrainingCalendarEvent): string {
  if (event.discipline === 'strength') return 'Strength priority';
  if (event.discipline === 'run') return 'Impact load';
  if (event.discipline === 'bike') return 'Lower-body endurance';
  if (event.discipline === 'swim') return 'Technical / aerobic';
  return 'Flexible training';
}
