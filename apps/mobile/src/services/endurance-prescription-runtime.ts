import type { PerformanceGoal, TrainingCalendarEvent } from '@circuit/domain';
import {
  buildEndurancePrescription,
  type EndurancePrescriptionContext,
  type EnduranceSessionPrescription,
} from '@circuit/planner/endurance-prescription';
import type { PlannedMultisportSession, SessionIntensity } from '@circuit/planner/multisport';

import { getLatestTrainingBlock, getTrainingCalendarEvents } from './database';
import { loadEndurancePrescriptionProfile } from './endurance-profile';
import { SIDE_QUEST_PLAN_SOURCE_ID } from './whole-athlete-plan';
import { refreshLatestWholeAthletePlan } from './whole-athlete-plan-runtime';

export interface EndurancePrescriptionPreview {
  event: TrainingCalendarEvent;
  prescription: EnduranceSessionPrescription;
  source: 'whole_athlete_plan' | 'calendar_fallback';
}

export async function loadEndurancePrescriptionPreview(
  eventId: string,
  date: string,
): Promise<EndurancePrescriptionPreview | null> {
  if (!eventId || !date) return null;
  const [events, savedBlock] = await Promise.all([
    getTrainingCalendarEvents({
      from: `${addDays(date, -1)}T00:00:00.000Z`,
      to: `${addDays(date, 2)}T23:59:59.999Z`,
    }),
    getLatestTrainingBlock(),
  ]);
  const event = events.find((candidate) => candidate.id === eventId);
  if (!event || !isEnduranceEvent(event)) return null;
  const context = prescriptionContext(savedBlock?.block.goal);

  if (event.sourceId === SIDE_QUEST_PLAN_SOURCE_ID) {
    const generated = await refreshLatestWholeAthletePlan().catch(() => null);
    const planned = generated ? resolveWholeAthleteSession(event, generated) : null;
    if (planned) {
      const prescription = buildEndurancePrescription(toPrescriptionSession(planned), context);
      if (prescription) return { event, prescription, source: 'whole_athlete_plan' };
    }
  }

  const fallback = calendarEventToPrescriptionSession(event);
  const prescription = fallback ? buildEndurancePrescription(fallback, context) : null;
  return prescription ? { event, prescription, source: 'calendar_fallback' } : null;
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
  event: TrainingCalendarEvent,
  generated: GeneratedWholeAthletePlan,
): WholeAthleteSession | null {
  const eventDate = event.startAt.slice(0, 10);
  const eventDuration = durationMinutes(event);
  const eventIntensity = generatedEventIntensity(event);
  const candidates = generated.weeks
    .flatMap((week) => week.sessions)
    .filter((session) => session.date === eventDate)
    .filter((session) => session.discipline === event.discipline)
    .filter((session) => session.title === event.title);

  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0] ?? null;

  const exact = candidates.find((session) =>
    session.durationMinutes === eventDuration
    && (!eventIntensity || normalizeIntensity(session.intensity) === eventIntensity));
  return exact ?? candidates.find((session) => session.durationMinutes === eventDuration) ?? candidates[0] ?? null;
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
  event: TrainingCalendarEvent,
): event is TrainingCalendarEvent & { discipline: 'swim' | 'bike' | 'run' } {
  return event.discipline === 'swim' || event.discipline === 'bike' || event.discipline === 'run';
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
