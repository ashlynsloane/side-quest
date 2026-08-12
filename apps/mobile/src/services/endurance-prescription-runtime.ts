import type { PerformanceGoal, TrainingCalendarEvent } from '@circuit/domain';
import { resolveGeneratedSessionByEventId, resolveGeneratedSessionForPreview } from '@circuit/planner';
import {
  buildEndurancePrescription,
  type EndurancePrescriptionContext,
  type EnduranceSessionPrescription,
} from '@circuit/planner/endurance-prescription';
import type { PlannedMultisportSession, SessionIntensity } from '@circuit/planner/multisport';

import { getLatestTrainingBlock, getTrainingCalendarEvents } from './database';
import { loadEndurancePrescriptionProfile } from './endurance-profile';
import { SIDE_QUEST_PLAN_SOURCE_ID } from './whole-athlete-plan';
import {
  getLatestWholeAthletePlanSnapshot,
  refreshLatestWholeAthletePlan,
} from './whole-athlete-plan-runtime';

export interface EndurancePrescriptionPreview {
  event: TrainingCalendarEvent;
  prescription: EnduranceSessionPrescription;
  source: 'whole_athlete_plan' | 'calendar_fallback' | 'route_snapshot';
}

export interface EndurancePrescriptionRouteHint {
  title?: string;
  discipline?: 'swim' | 'bike' | 'run';
  startAt?: string;
  endAt?: string;
}

export async function loadEndurancePrescriptionPreview(
  eventId: string,
  date: string,
  routeHint: EndurancePrescriptionRouteHint = {},
): Promise<EndurancePrescriptionPreview | null> {
  if (!eventId || !date) return null;

  const [events, savedBlock] = await Promise.all([
    getTrainingCalendarEvents({
      from: `${addDays(date, -1)}T00:00:00.000Z`,
      to: `${addDays(date, 2)}T23:59:59.999Z`,
    }),
    getLatestTrainingBlock(),
  ]);

  const exactEvent = events.find((candidate) => candidate.id === eventId) ?? null;
  const generatedRoute = exactEvent?.sourceId === SIDE_QUEST_PLAN_SOURCE_ID
    || eventId.startsWith('sq_plan_');
  const context = prescriptionContext(savedBlock?.block.goal);

  if (generatedRoute) {
    // A reconciliation can replace persisted calendar rows between the tap on
    // Week and this screen loading. Resolve planner identity BEFORE requiring
    // the exact event row so a harmless refresh does not become
    // "Workout unavailable".
    const cached = savedBlock?.block.id
      ? getLatestWholeAthletePlanSnapshot(savedBlock.block.id)
      : getLatestWholeAthletePlanSnapshot();
    const generated = cached ?? await refreshLatestWholeAthletePlan().catch(() => null);
    const planned = generated
      ? resolveWholeAthleteSession(eventId, date, routeHint, exactEvent, generated)
      : null;

    if (planned) {
      const event = exactEvent
        ?? findCurrentLinkedEvent(events, planned)
        ?? eventFromPlannedSession(eventId, planned, routeHint);
      const prescription = buildEndurancePrescription(toPrescriptionSession(planned), context);
      if (prescription) return { event, prescription, source: 'whole_athlete_plan' };
    }
  }

  const event = exactEvent
    ?? findHintedCalendarEvent(events, date, routeHint)
    ?? eventFromRouteHint(eventId, date, routeHint);

  if (!event || !isEnduranceEvent(event)) return null;

  const fallback = calendarEventToPrescriptionSession(event);
  const prescription = fallback ? buildEndurancePrescription(fallback, context) : null;
  if (!prescription) return null;
  return {
    event,
    prescription,
    source: exactEvent || events.some((candidate) => candidate.id === event.id)
      ? 'calendar_fallback'
      : 'route_snapshot',
  };
}

type GeneratedWholeAthletePlan = NonNullable<Awaited<ReturnType<typeof refreshLatestWholeAthletePlan>>>;
type WholeAthleteSession = GeneratedWholeAthletePlan['weeks'][number]['sessions'][number];

function prescriptionContext(goal: PerformanceGoal | undefined): EndurancePrescriptionContext {
  const profile = loadEndurancePrescriptionProfile();
  return {
    swim: {
      environment: profile.swimEnvironment,
      poolLength: profile.poolLength,
      distanceUnit: profile.swimDistanceUnit,
      cssSecondsPer100: profile.cssSecondsPer100,
      proficiency: goal?.capacityProfile?.swimProficiency,
    },
    run: {
      returnToRunProtocol: profile.returnToRunProtocol,
    },
  };
}

function resolveWholeAthleteSession(
  eventId: string,
  date: string,
  routeHint: EndurancePrescriptionRouteHint,
  event: TrainingCalendarEvent | null,
  generated: GeneratedWholeAthletePlan,
): WholeAthleteSession | null {
  const sessions = generated.weeks.flatMap((week) => week.sessions);
  const discipline = isEnduranceEvent(event ?? undefined) ? event!.discipline : routeHint.discipline;
  const duration = event ? durationMinutes(event) : hintedDurationMinutes(routeHint);

  const linked = resolveGeneratedSessionForPreview(
    eventId,
    {
      date,
      discipline,
      title: event?.title ?? routeHint.title,
      durationMinutes: duration,
    },
    sessions,
  );
  if (!linked) return null;
  if (linked.discipline !== 'swim' && linked.discipline !== 'bike' && linked.discipline !== 'run') return null;
  return linked;
}

function findCurrentLinkedEvent(
  events: TrainingCalendarEvent[],
  session: WholeAthleteSession,
): TrainingCalendarEvent | null {
  const linked = events.find((event) =>
    event.sourceId === SIDE_QUEST_PLAN_SOURCE_ID
    && resolveGeneratedSessionByEventId(event.id, [session]) === session);
  return linked ?? null;
}

function findHintedCalendarEvent(
  events: TrainingCalendarEvent[],
  date: string,
  hint: EndurancePrescriptionRouteHint,
): TrainingCalendarEvent | null {
  let candidates = events
    .filter(isEnduranceEvent)
    .filter((event) => event.startAt.slice(0, 10) === date)
    .filter((event) => !hint.discipline || event.discipline === hint.discipline);

  if (!candidates.length) return null;

  if (hint.title) {
    const titleMatches = candidates.filter((event) => event.title === hint.title);
    if (titleMatches.length === 1) return titleMatches[0] ?? null;
    if (titleMatches.length > 1) candidates = titleMatches;
  }

  const hintDuration = hintedDurationMinutes(hint);
  if (hintDuration) {
    const durationMatches = candidates.filter((event) => durationMinutes(event) === hintDuration);
    if (durationMatches.length === 1) return durationMatches[0] ?? null;
    if (durationMatches.length > 1) candidates = durationMatches;
  }

  return candidates.length === 1 ? candidates[0] ?? null : null;
}

function eventFromPlannedSession(
  eventId: string,
  session: WholeAthleteSession,
  hint: EndurancePrescriptionRouteHint,
): TrainingCalendarEvent {
  const startAt = hint.startAt && hint.startAt.slice(0, 10) === session.date
    ? hint.startAt
    : `${session.date}T12:00:00.000Z`;
  const endAt = hint.endAt && hint.startAt === startAt
    ? hint.endAt
    : new Date(Date.parse(startAt) + session.durationMinutes * 60_000).toISOString();
  return {
    id: eventId,
    sourceId: SIDE_QUEST_PLAN_SOURCE_ID,
    title: session.title,
    startAt,
    endAt,
    allDay: !hint.startAt,
    discipline: session.discipline as 'swim' | 'bike' | 'run',
    description: [
      `Side Quest generated · ${session.durationMinutes} min · ${normalizeIntensity(session.intensity)}`,
      ...session.rationale,
    ].join('\n'),
    externalUid: eventId,
  };
}

function eventFromRouteHint(
  eventId: string,
  date: string,
  hint: EndurancePrescriptionRouteHint,
): TrainingCalendarEvent | null {
  if (!hint.title || !hint.discipline) return null;
  const startAt = hint.startAt || `${date}T12:00:00.000Z`;
  const hintedDuration = hintedDurationMinutes(hint) ?? 60;
  const endAt = hint.endAt || new Date(Date.parse(startAt) + hintedDuration * 60_000).toISOString();
  return {
    id: eventId,
    sourceId: SIDE_QUEST_PLAN_SOURCE_ID,
    title: hint.title,
    startAt,
    endAt,
    allDay: !hint.startAt,
    discipline: hint.discipline,
    description: `Side Quest generated · ${hintedDuration} min · moderate`,
    externalUid: eventId,
  };
}

function hintedDurationMinutes(hint: EndurancePrescriptionRouteHint): number | undefined {
  if (!hint.startAt || !hint.endAt) return undefined;
  const start = Date.parse(hint.startAt);
  const end = Date.parse(hint.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined;
  return Math.max(10, Math.round((end - start) / 60_000));
}

function toPrescriptionSession(session: WholeAthleteSession): PlannedMultisportSession {
  if (session.discipline !== 'swim' && session.discipline !== 'bike' && session.discipline !== 'run') {
    throw new Error('Only endurance sessions can be materialized as endurance prescriptions.');
  }
  return {
    id: session.id,
    date: session.date,
    day: weekdayForDate(session.date),
    discipline: session.discipline,
    title: session.title,
    durationMinutes: Math.max(10, Math.round(session.durationMinutes)),
    intensity: normalizeIntensity(session.intensity),
    priority: session.keySession ? 'key' : 'support',
    ownership: session.planningCommitment === 'fixed'
      ? 'fixed'
      : session.planningCommitment === 'preferred'
        ? 'preferred'
        : 'generated',
    rationale: session.rationale,
  };
}

function calendarEventToPrescriptionSession(event: TrainingCalendarEvent): PlannedMultisportSession | null {
  if (!isEnduranceEvent(event)) return null;
  const lines = (event.description ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const rationale = lines.filter((line) => !line.startsWith('Side Quest generated ·') && !line.startsWith('Side Quest naming ·'));
  return {
    id: event.id,
    date: event.startAt.slice(0, 10),
    day: weekdayForDate(event.startAt.slice(0, 10)),
    discipline: event.discipline,
    title: event.title,
    durationMinutes: durationMinutes(event),
    intensity: generatedEventIntensity(event) ?? inferEventIntensity(event),
    priority: inferEventIntensity(event) === 'hard' ? 'key' : 'support',
    ownership: event.sourceId === SIDE_QUEST_PLAN_SOURCE_ID ? 'generated' : 'fixed',
    rationale: rationale.length ? rationale : ['Scheduled in your training calendar.'],
  };
}

function isEnduranceEvent(
  event: TrainingCalendarEvent | null | undefined,
): event is TrainingCalendarEvent & { discipline: 'swim' | 'bike' | 'run' } {
  return event?.discipline === 'swim' || event?.discipline === 'bike' || event?.discipline === 'run';
}

function generatedEventIntensity(event: TrainingCalendarEvent): SessionIntensity | null {
  const match = event.description?.match(/Side Quest generated · \d+ min · ([a-z_]+)/i);
  if (!match?.[1]) return null;
  return normalizeIntensity(match[1]);
}

function inferEventIntensity(event: TrainingCalendarEvent): SessionIntensity {
  const text = `${event.title} ${event.description ?? ''}`.toLowerCase();
  if (/quality|interval|threshold|tempo|hard|race|vo2|max/.test(text)) return 'hard';
  if (/easy|recovery/.test(text)) return 'easy';
  return 'moderate';
}

function normalizeIntensity(value: string): SessionIntensity {
  if (value === 'recovery' || value === 'easy') return 'easy';
  if (value === 'hard' || value === 'max') return 'hard';
  return 'moderate';
}

function durationMinutes(event: TrainingCalendarEvent): number {
  if (event.endAt) {
    const start = Date.parse(event.startAt);
    const end = Date.parse(event.endAt);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.max(10, Math.round((end - start) / 60_000));
    }
  }
  const fromDescription = event.description?.match(/Side Quest generated · (\d+) min/i)?.[1];
  return Math.max(10, Number(fromDescription ?? 60));
}

function weekdayForDate(date: string): PlannedMultisportSession['day'] {
  const value = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][value] ?? 'monday') as PlannedMultisportSession['day'];
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
