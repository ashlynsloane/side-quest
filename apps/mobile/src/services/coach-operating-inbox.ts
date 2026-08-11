import type { TrainingBlockPlan, TrainingCalendarEvent } from '@circuit/domain';

import { loadPainContextObservations } from './athlete-context-memory';
import type { CoachClosedLoopSummary } from './coach-closed-loop-state';
import type { CoachObservedOutcomeRecord } from './coach-observed-outcomes';

export type CoachInboxLevel = 'protection' | 'suggestion' | 'check_in' | 'info';

export interface CoachOperatingInboxItem {
  id: string;
  level: CoachInboxLevel;
  title: string;
  body: string;
  reason: string;
  actionable: boolean;
}

const LEVEL_RANK: Record<CoachInboxLevel, number> = { protection: 4, check_in: 3, suggestion: 2, info: 1 };

export function buildCoachOperatingInbox(input: {
  block: TrainingBlockPlan | null;
  calendarEvents: TrainingCalendarEvent[];
  closedLoop: CoachClosedLoopSummary | null;
  observedOutcomes: CoachObservedOutcomeRecord[];
  now?: string;
}): CoachOperatingInboxItem[] {
  const now = input.now ?? new Date().toISOString();
  const nowMs = new Date(now).getTime();
  const items: CoachOperatingInboxItem[] = [];
  const pain = loadPainContextObservations();
  const recentCutoff = new Date(nowMs - 14 * 86_400_000).toISOString();
  const injuryLike = pain.filter((item) =>
    item.occurredAt >= recentCutoff
    && (item.kind === 'focal_musculoskeletal' || item.kind === 'unknown')
    && (item.stoppedSession || item.functionalInterference === 'modified_session' || item.worsening),
  );
  const grouped = new Map<string, typeof injuryLike>();
  for (const item of injuryLike) {
    const key = `${item.affectedArea}:${item.discipline ?? 'unknown'}`;
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  for (const [key, observations] of grouped) {
    if (observations.length < 2) continue;
    const latest = [...observations].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]!;
    const ageHours = (nowMs - new Date(latest.occurredAt).getTime()) / 3_600_000;
    const activeProtectionWindow = Number.isFinite(ageHours) && ageHours >= 0 && ageHours <= 72;
    items.push({
      id: `repeated-pain:${key}`,
      level: activeProtectionWindow ? 'protection' : 'suggestion',
      title: activeProtectionWindow
        ? 'A repeated function-limiting symptom needs attention.'
        : 'A recent repeated symptom pattern is worth reviewing.',
      body: `${observations.length} recent ${latest.discipline ?? 'training'} observations affected ${latest.affectedArea.replaceAll('_', ' ')} function. ${activeProtectionWindow ? 'Progression should stay conservative until normal tolerance is clearer.' : 'Use this history as context if the same symptom returns; do not treat an older alert as proof of a current restriction.'}`,
      reason: 'Repeated functional interruption carries more weight than a single numeric pain score, but alert severity should decay when there is no new event.',
      actionable: true,
    });
  }

  const followUp = input.closedLoop?.dueFollowUp;
  if (followUp) {
    items.push({
      id: `follow-up:${followUp.id}`,
      level: 'check_in',
      title: followUp.followUp.priority === 'high' ? 'Check how the protected session responded.' : 'Close the loop on the last adjustment.',
      body: followUp.followUp.question,
      reason: 'Outcome feedback is needed before Side Quest treats this intervention as personally useful or harmful.',
      actionable: true,
    });
  }

  const conflict = findHardDayConflict(input.block, input.calendarEvents, now);
  if (conflict) items.push(conflict);

  const latestObserved = [...input.observedOutcomes].sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
  if (latestObserved?.execution.status === 'exceeded_prescription') {
    items.push({
      id: `observed:${latestObserved.interventionId}`,
      level: 'suggestion',
      title: 'The completed workout exceeded the Coach adjustment.',
      body: latestObserved.execution.evidence.join(' '),
      reason: 'Observed execution is useful context, but it does not tell Side Quest whether symptoms felt better or worse.',
      actionable: true,
    });
  } else if (latestObserved?.execution.status === 'different_session') {
    items.push({
      id: `observed:${latestObserved.interventionId}`,
      level: 'suggestion',
      title: 'A different workout happened instead of the Coach-adjusted session.',
      body: latestObserved.execution.evidence.join(' '),
      reason: 'Side Quest should re-evaluate the remaining week rather than assume the original adjustment was completed.',
      actionable: true,
    });
  } else if (latestObserved?.execution.status === 'followed') {
    items.push({
      id: `observed:${latestObserved.interventionId}`,
      level: 'info',
      title: 'The last Coach adjustment was followed.',
      body: latestObserved.execution.evidence.join(' '),
      reason: 'Completion can be observed automatically; symptom response still comes from the athlete.',
      actionable: false,
    });
  }

  const cue = input.closedLoop?.proactiveCue;
  if (cue) {
    items.push({
      id: 'personal-pattern',
      level: cue.level === 'attention' ? 'suggestion' : 'info',
      title: cue.headline,
      body: cue.body,
      reason: cue.evidence,
      actionable: false,
    });
  }

  if (!items.length && input.block) {
    items.push({
      id: 'no-current-attention',
      level: 'info',
      title: 'No current coaching alert.',
      body: 'Side Quest does not see a due follow-up, repeated recent functional warning, observed Coach overshoot, or obvious high-cost schedule conflict right now.',
      reason: 'This reflects only the training information available to the app; it is not a medical clearance or a guarantee that recovery is complete.',
      actionable: false,
    });
  }

  return dedupe(items)
    .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.id.localeCompare(b.id))
    .slice(0, 5);
}

function findHardDayConflict(
  block: TrainingBlockPlan | null,
  events: TrainingCalendarEvent[],
  now: string,
): CoachOperatingInboxItem | null {
  if (!block) return null;
  const today = now.slice(0, 10);
  const horizon = addDays(today, 10);
  const highStrengthDates = new Set(block.weeks.flatMap((week) => week.sessions)
    .filter((session) => session.date >= today && session.date <= horizon)
    .filter((session) => session.completionStatus !== 'skipped' && session.intendedLoad === 'high')
    .map((session) => session.date));
  const hardEndurance = events.filter((event) => {
    const date = event.startAt.slice(0, 10);
    if (!highStrengthDates.has(date)) return false;
    const text = `${event.title} ${event.description ?? ''}`.toLowerCase();
    return event.discipline !== 'strength' && event.discipline !== 'rest' && /\b(hard|threshold|tempo|interval|vo2|race|long)\b/.test(text);
  });
  const event = hardEndurance.sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  if (!event) return null;
  const date = event.startAt.slice(0, 10);
  return {
    id: `hard-day-conflict:${date}`,
    level: 'suggestion',
    title: 'Two high-cost sessions are clustered together.',
    body: `${event.title} and high-load strength both land on ${date}. Coach can move the lower-priority session instead of stacking recovery cost.`,
    reason: 'This is a planning conflict, not a health warning; the current week should be re-checked before moving anything.',
    actionable: true,
  };
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dedupe(items: CoachOperatingInboxItem[]): CoachOperatingInboxItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
