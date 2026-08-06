import type {
  BodyRegion,
  CompletedTrainingDiscipline,
  EnduranceActivity,
  EnduranceDiscipline,
  EnduranceIntensity,
  EnduranceRegionContribution,
  PlannedCompletedMatch,
  StrengthWorkoutLinkCandidate,
  WorkoutSensorLink,
  PlannedStrengthSession,
  TrainingBlockPlan,
  TrainingCalendarEvent,
} from '@circuit/domain';

import type { PlanConflictSeverity, PlanMoveProposal } from './adaptive';

export interface MatchCompletedActivitiesInput {
  activities: EnduranceActivity[];
  events: TrainingCalendarEvent[];
  now?: string;
}

export interface EnduranceContributionSummary {
  activity: EnduranceActivity;
  contributions: EnduranceRegionContribution[];
  totalContribution: number;
}

export interface PostEnduranceReplanInput {
  block: TrainingBlockPlan;
  activity: EnduranceActivity;
  calendarEvents?: TrainingCalendarEvent[];
  today?: string;
}

export interface MatchExternalTrainingToWorkoutsInput {
  activities: EnduranceActivity[];
  workouts: StrengthWorkoutLinkCandidate[];
  now?: string;
}

const COMMON_TITLE_WORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'to', 'for', 'with', 'workout', 'session',
  'run', 'running', 'ride', 'bike', 'cycling', 'swim', 'pool', 'open', 'water',
  'easy', 'recovery', 'training', 'planned', 'activity', 'indoor', 'outdoor',
]);

const EXTERNAL_CLASS_WORDS = /\bonix\b|\bhiit\b|high intensity|strength|weight|lifting|lift|circuit|boot ?camp|cross ?fit|gym|class|functional|conditioning|x[- ]?train/i;

const CONTRIBUTION_PROFILES: Record<EnduranceDiscipline, Array<[BodyRegion, number]>> = {
  swim: [
    ['lats', 0.34], ['shoulders', 0.27], ['upper_back', 0.22], ['triceps', 0.14],
    ['core_rotation', 0.11], ['core_anterior', 0.08], ['chest', 0.06],
  ],
  bike: [
    ['quadriceps', 0.36], ['glutes', 0.24], ['hamstrings', 0.15], ['hip_flexors', 0.10],
    ['gastrocnemius', 0.08], ['soleus', 0.07], ['core_anterior', 0.05],
  ],
  run: [
    ['glutes', 0.23], ['quadriceps', 0.22], ['hamstrings', 0.17], ['gastrocnemius', 0.15],
    ['soleus', 0.12], ['feet_ankles', 0.10], ['hip_abductors', 0.07], ['core_anterior', 0.04],
  ],
};

const FULL_BODY_CLASS_PROFILE: Array<[BodyRegion, number]> = [
  ['glutes', 0.18], ['quadriceps', 0.16], ['hamstrings', 0.12], ['shoulders', 0.13],
  ['upper_back', 0.12], ['chest', 0.09], ['core_anterior', 0.12], ['core_rotation', 0.08],
];

export function isEnduranceDiscipline(value: CompletedTrainingDiscipline): value is EnduranceDiscipline {
  return value === 'swim' || value === 'bike' || value === 'run';
}

export function isMatchEligibleCalendarEvent(event: TrainingCalendarEvent): boolean {
  if (event.discipline === 'swim' || event.discipline === 'bike' || event.discipline === 'run' || event.discipline === 'strength') return true;
  if (event.discipline !== 'other') return false;
  return EXTERNAL_CLASS_WORDS.test(`${event.title} ${event.description ?? ''}`);
}

export function inferEnduranceIntensity({
  name,
  movingTimeSeconds,
  relativeEffort,
}: Pick<EnduranceActivity, 'name' | 'movingTimeSeconds' | 'relativeEffort'>): EnduranceIntensity {
  const text = name.toLowerCase();
  if (/race|time trial|competition|event/.test(text)) return 'race';
  if (/vo2|threshold|interval|tempo|hill repeat|hard|brick|long/.test(text)) return 'hard';
  if (/recovery|very easy|shakeout|easy spin|drill/.test(text)) return 'recovery';
  if (/easy|zone 1|zone 2|aerobic|technique/.test(text)) return 'easy';
  if ((relativeEffort ?? 0) >= 120) return 'hard';
  if ((relativeEffort ?? 0) >= 55 || movingTimeSeconds >= 5_400) return 'moderate';
  return 'unknown';
}

export function matchCompletedActivities({
  activities,
  events,
  now = new Date().toISOString(),
}: MatchCompletedActivitiesInput): PlannedCompletedMatch[] {
  const eligibleEvents = events
    .filter(isMatchEligibleCalendarEvent)
    .sort((left, right) => left.startAt.localeCompare(right.startAt));
  const usedEvents = new Set<string>();
  const matches: PlannedCompletedMatch[] = [];

  for (const activity of [...activities].sort((left, right) => left.startAt.localeCompare(right.startAt))) {
    if (activity.deletedAt || activity.classification === 'ignored') continue;
    const candidates = eligibleEvents
      .filter((event) => !usedEvents.has(event.id) && isCompatiblePlan(activity, event))
      .map((event) => scoreCandidate(activity, event))
      .filter((candidate) => candidate.hoursApart <= 36)
      .sort((left, right) => right.score - left.score || left.event.startAt.localeCompare(right.event.startAt));

    const best = candidates[0];
    const second = candidates[1];
    let status: PlannedCompletedMatch['status'] = 'unmatched';
    let method: PlannedCompletedMatch['method'] = 'none';
    let calendarEventId: string | undefined;
    let confidence = best?.score ?? 0;
    let rationale = best?.rationale ?? ['No compatible planned event was close enough in time.'];

    if (best) {
      const margin = best.score - (second?.score ?? 0);
      if (best.externalIdMatch) {
        status = 'matched';
        method = 'external_id';
      } else if (best.score >= 0.68 && margin >= 0.10) {
        status = 'matched';
        method = 'time_title_duration';
      } else if (best.score >= 0.50) {
        status = 'ambiguous';
        method = 'time_title_duration';
        rationale = [...rationale, 'The best candidate was not distinct enough for an automatic canonical match.'];
      }
      if (status !== 'unmatched') calendarEventId = best.event.id;
      if (status === 'matched') usedEvents.add(best.event.id);
    }

    matches.push({
      id: `match_${stableHash(`${activity.id}:${calendarEventId ?? 'none'}`)}`,
      calendarEventId,
      activityId: activity.id,
      status,
      confidence: round4(confidence),
      method,
      rationale,
      createdAt: now,
      updatedAt: now,
    });
  }

  return matches;
}

export function matchExternalTrainingToWorkouts({
  activities,
  workouts,
  now = new Date().toISOString(),
}: MatchExternalTrainingToWorkoutsInput): WorkoutSensorLink[] {
  const eligibleActivities = activities
    .filter((activity) => !activity.deletedAt && activity.classification !== 'ignored')
    .filter((activity) => activity.discipline === 'strength' || activity.discipline === 'hiit')
    .sort((left, right) => left.startAt.localeCompare(right.startAt));
  const eligibleWorkouts = [...workouts].sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const usedWorkouts = new Set<string>();
  const links: WorkoutSensorLink[] = [];

  for (const activity of eligibleActivities) {
    const candidates = eligibleWorkouts
      .filter((workout) => !usedWorkouts.has(workout.id))
      .map((workout) => scoreWorkoutSensorCandidate(activity, workout))
      .filter((candidate) => candidate.startHoursApart <= 4 && candidate.dayApart <= 1)
      .sort((left, right) => right.score - left.score || left.workout.startedAt.localeCompare(right.workout.startedAt));
    const best = candidates[0];
    const second = candidates[1];
    if (!best || best.score < 0.52) continue;
    const margin = best.score - (second?.score ?? 0);
    const status: WorkoutSensorLink['status'] = best.score >= 0.72 && margin >= 0.10 ? 'linked' : 'ambiguous';
    if (status === 'linked') usedWorkouts.add(best.workout.id);
    links.push({
      id: `sensor_link_${stableHash(`${activity.id}:${best.workout.id}`)}`,
      activityId: activity.id,
      workoutId: best.workout.id,
      status,
      confidence: round4(best.score),
      method: 'automatic',
      rationale: best.rationale,
      createdAt: now,
      updatedAt: now,
    });
  }

  return links;
}

export function calculateEnduranceContributions(activity: EnduranceActivity): EnduranceContributionSummary {
  if (activity.deletedAt || activity.classification === 'ignored') return { activity, contributions: [], totalContribution: 0 };

  if (!isEnduranceDiscipline(activity.discipline)) {
    if (activity.classification !== 'full_body_strength') return { activity, contributions: [], totalContribution: 0 };
    const minutes = Math.max(1, activity.movingTimeSeconds / 60);
    const durationFactor = Math.min(1.2, Math.sqrt(minutes / 45));
    const totalScale = Math.min(4, 3.2 * durationFactor);
    const coefficientTotal = FULL_BODY_CLASS_PROFILE.reduce((sum, [, coefficient]) => sum + coefficient, 0);
    const contributions = FULL_BODY_CLASS_PROFILE.map(([region, coefficient]) => ({
      id: `endurance_contribution_${stableHash(`${activity.id}:${region}`)}`,
      activityId: activity.id,
      region,
      contribution: round4(totalScale * coefficient / coefficientTotal),
      confidence: 'low' as const,
      rationale: 'The athlete classified this external activity as a full-body strength class. Credit is deliberately capped and remains separate from exercise-level Side Quest strength history.',
      completedAt: activity.startAt,
    }));
    return {
      activity,
      contributions,
      totalContribution: round4(contributions.reduce((sum, item) => sum + item.contribution, 0)),
    };
  }

  const minutes = Math.max(1, activity.movingTimeSeconds / 60);
  const durationFactor = Math.min(1.35, Math.sqrt(minutes / 45));
  const intensityFactor = intensityWeight(activity.intensity);
  const totalScale = Math.min(12, 6 * durationFactor * intensityFactor);
  const confidence: EnduranceRegionContribution['confidence'] = activity.intensity === 'unknown' ? 'low' : 'moderate';
  const profile = CONTRIBUTION_PROFILES[activity.discipline];
  const coefficientTotal = profile.reduce((sum, [, coefficient]) => sum + coefficient, 0);
  const contributions = profile.map(([region, coefficient]) => ({
    id: `endurance_contribution_${stableHash(`${activity.id}:${region}`)}`,
    activityId: activity.id,
    region,
    contribution: round4(totalScale * coefficient / coefficientTotal),
    confidence,
    rationale: `${activity.discipline} contributes conservatively through repeated sport-specific loading; it is not treated as equivalent to direct strength work.`,
    completedAt: activity.startAt,
  }));
  return {
    activity,
    contributions,
    totalContribution: round4(contributions.reduce((sum, item) => sum + item.contribution, 0)),
  };
}

export function buildPostEnduranceReplanProposals({
  block,
  activity,
  calendarEvents = [],
  today = localIsoDate(new Date()),
}: PostEnduranceReplanInput): PlanMoveProposal[] {
  if (activity.deletedAt || !isEnduranceDiscipline(activity.discipline)) return [];
  const load = completedEnduranceLoad(activity);
  if (load === 'low') return [];
  const activityDate = activityDateKey(activity);
  const sessions = block.weeks
    .flatMap((week) => week.sessions)
    .filter((session) => !['completed', 'skipped'].includes(session.completionStatus))
    .filter((session) => session.date >= today)
    .sort((left, right) => left.date.localeCompare(right.date) || left.order - right.order);
  const occupied = new Set(sessions.map((session) => session.date));
  const proposals: PlanMoveProposal[] = [];

  for (const session of sessions) {
    const gap = dayDifference(activityDate, session.date);
    if (gap < 0 || gap > 1) continue;
    if (!shouldMoveAfterActivity(session, activity, load, gap)) continue;
    const target = findPostActivityDate({ block, session, activityDate, calendarEvents, occupied, today });
    if (!target || target === session.date) continue;
    const severity: PlanConflictSeverity = gap === 0 || load === 'high' ? 'high' : 'moderate';
    proposals.push({
      id: `endurance_move_${stableHash(`${activity.id}:${session.id}:${target}`)}`,
      sessionId: session.id,
      sessionTitle: session.title,
      fromDate: session.date,
      toDate: target,
      severity,
      reason: `${activity.name} was completed ${gap === 0 ? 'on the same day' : 'the previous day'} (${formatMinutes(activity.movingTimeSeconds)}). The move protects strength quality without rewriting completed history.`,
    });
    occupied.delete(session.date);
    occupied.add(target);
  }
  return proposals;
}

function isCompatiblePlan(activity: EnduranceActivity, event: TrainingCalendarEvent): boolean {
  if (isEnduranceDiscipline(activity.discipline)) return event.discipline === activity.discipline;
  if (activity.discipline === 'strength') {
    return event.discipline === 'strength' || (event.discipline === 'other' && EXTERNAL_CLASS_WORDS.test(`${event.title} ${event.description ?? ''}`));
  }
  return event.discipline === 'strength' || (event.discipline === 'other' && EXTERNAL_CLASS_WORDS.test(`${event.title} ${event.description ?? ''}`));
}

function scoreWorkoutSensorCandidate(activity: EnduranceActivity, workout: StrengthWorkoutLinkCandidate) {
  const activityStart = new Date(activity.startAt).getTime();
  const activityDuration = Math.max(60, activity.elapsedTimeSeconds || activity.movingTimeSeconds);
  const activityEnd = activityStart + activityDuration * 1_000;
  const workoutStart = new Date(workout.startedAt).getTime();
  const workoutEndRaw = new Date(workout.completedAt).getTime();
  const workoutEnd = Number.isFinite(workoutEndRaw) && workoutEndRaw > workoutStart ? workoutEndRaw : workoutStart + activityDuration * 1_000;
  const workoutDuration = Math.max(60, (workoutEnd - workoutStart) / 1_000);
  const overlapSeconds = Math.max(0, Math.min(activityEnd, workoutEnd) - Math.max(activityStart, workoutStart)) / 1_000;
  const overlapScore = Math.min(1, overlapSeconds / Math.max(60, Math.min(activityDuration, workoutDuration)));
  const startHoursApart = Math.abs(activityStart - workoutStart) / 3_600_000;
  const startScore = Math.max(0, 1 - startHoursApart / 3);
  const durationScore = Math.max(0, 1 - Math.abs(activityDuration - workoutDuration) / Math.max(activityDuration, workoutDuration));
  const titleScore = tokenSimilarity(activity.name, workout.name);
  const activityDate = activity.startLocal?.slice(0, 10) ?? localDateFromIso(activity.startAt);
  const workoutDate = localDateFromIso(workout.startedAt);
  const dayApart = Math.abs(dayDifference(activityDate, workoutDate));
  const sameDate = dayApart === 0;
  const score = Math.min(0.99,
    (sameDate ? 0.18 : 0)
      + 0.36 * overlapScore
      + 0.24 * startScore
      + 0.16 * durationScore
      + 0.06 * titleScore,
  );
  const rationale = [
    sameDate ? 'The watch activity and Side Quest workout occurred on the same date.' : `The records are ${dayApart} day apart.`,
    overlapScore > 0 ? `Recorded time overlap is ${Math.round(overlapScore * 100)}%.` : `Start times are ${startHoursApart.toFixed(1)} hours apart.`,
    `Duration similarity is ${Math.round(durationScore * 100)}%.`,
    `Title similarity is ${Math.round(titleScore * 100)}%.`,
  ];
  return { workout, score, startHoursApart, dayApart, rationale };
}

function scoreCandidate(activity: EnduranceActivity, event: TrainingCalendarEvent) {
  const hoursApart = Math.abs(new Date(activity.startAt).getTime() - new Date(event.startAt).getTime()) / 3_600_000;
  const sameDate = activityDateKey(activity) === eventDateKey(event);
  const eventDuration = event.endAt
    ? Math.max(0, (new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 1_000)
    : undefined;
  const externalIdMatch = Boolean(event.externalUid && event.externalUid === activity.externalId);
  const timeScore = Math.max(0, 1 - hoursApart / 18);
  const titleScore = tokenSimilarity(activity.name, `${event.title} ${event.description ?? ''}`);
  const durationScore = eventDuration && eventDuration > 0
    ? Math.max(0, 1 - Math.abs(activity.movingTimeSeconds - eventDuration) / Math.max(activity.movingTimeSeconds, eventDuration))
    : 0.45;
  const score = externalIdMatch
    ? 1
    : Math.min(0.99, (sameDate ? 0.34 : 0) + 0.28 * timeScore + 0.24 * titleScore + 0.14 * durationScore);
  const rationale = [
    sameDate ? 'Planned and completed sessions occur on the same date.' : `Start times are ${hoursApart.toFixed(1)} hours apart.`,
    `Title similarity is ${Math.round(titleScore * 100)}%.`,
    eventDuration ? `Duration similarity is ${Math.round(durationScore * 100)}%.` : 'The planned event did not include a usable duration.',
  ];
  if (externalIdMatch) rationale.unshift('The external identifiers match exactly.');
  return { event, hoursApart, externalIdMatch, score, rationale };
}

function tokenSimilarity(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function tokenSet(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')
    .map((token) => token.trim()).filter((token) => token.length > 1 && !COMMON_TITLE_WORDS.has(token)));
}

function intensityWeight(value: EnduranceIntensity): number {
  if (value === 'race') return 1.25;
  if (value === 'hard') return 1.15;
  if (value === 'moderate') return 1;
  if (value === 'easy') return 0.82;
  if (value === 'recovery') return 0.62;
  return 0.78;
}

function completedEnduranceLoad(activity: EnduranceActivity): 'low' | 'moderate' | 'high' {
  const minutes = activity.movingTimeSeconds / 60;
  if (activity.intensity === 'race' || activity.intensity === 'hard') return 'high';
  if (activity.discipline === 'swim') {
    if (minutes >= 75) return 'high';
    if (minutes >= 40) return 'moderate';
  } else {
    if (minutes >= 90) return 'high';
    if (minutes >= 45) return 'moderate';
  }
  return 'low';
}

function shouldMoveAfterActivity(
  session: PlannedStrengthSession,
  activity: EnduranceActivity,
  load: 'moderate' | 'high',
  gap: number,
): boolean {
  if (gap === 0) {
    if (activity.discipline === 'swim') return session.purpose === 'swim_support' || session.purpose === 'full_body' || session.intendedLoad === 'high';
    return session.intendedLoad !== 'light' || load === 'high';
  }
  if (load !== 'high') return false;
  if (activity.discipline === 'swim') return session.purpose === 'swim_support' && session.intendedLoad !== 'light';
  return session.intendedLoad !== 'light';
}

function findPostActivityDate({
  block,
  session,
  activityDate,
  calendarEvents,
  occupied,
  today,
}: {
  block: TrainingBlockPlan;
  session: PlannedStrengthSession;
  activityDate: string;
  calendarEvents: TrainingCalendarEvent[];
  occupied: Set<string>;
  today: string;
}): string | null {
  const week = block.weeks.find((item) => item.sessions.some((candidate) => candidate.id === session.id));
  if (!week) return null;
  const weekEnd = addDays(week.weekStartDate, 6);
  for (let offset = 1; offset <= 5; offset += 1) {
    const date = addDays(session.date, offset);
    if (date < today || date > weekEnd || date <= activityDate || occupied.has(date)) continue;
    if (block.goal.eventDate && date >= block.goal.eventDate) continue;
    const events = eventsOnDate(calendarEvents, date);
    if (events.some((event) => event.discipline === 'rest')) continue;
    if (events.some((event) => event.discipline === 'run' || event.discipline === 'bike')) continue;
    if (session.purpose === 'swim_support' && events.some((event) => event.discipline === 'swim')) continue;
    return date;
  }
  return null;
}

function eventsOnDate(events: TrainingCalendarEvent[], date: string): TrainingCalendarEvent[] {
  return events.filter((event) => eventDateKey(event) === date);
}

function activityDateKey(activity: EnduranceActivity): string {
  return activity.startLocal?.slice(0, 10) || localDateFromIso(activity.startAt);
}

function eventDateKey(event: TrainingCalendarEvent): string {
  return localDateFromIso(event.startAt);
}

function localDateFromIso(value: string): string {
  return localIsoDate(new Date(value));
}

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayDifference(left: string, right: string): number {
  const start = new Date(`${left}T12:00:00.000Z`).getTime();
  const end = new Date(`${right}T12:00:00.000Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatMinutes(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
