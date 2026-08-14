import type { TrainingCalendarEvent } from '@circuit/domain';

import type { EquipmentProfile } from './database';
import type { GeneratedWholeAthleteBlock, WholeAthleteCapacityInput } from './whole-athlete-plan';
import {
  expandTrainingAvailability,
  formatAvailabilityTime,
  type AvailabilityScheduledSession,
  type AvailabilityScheduledWeekPlan,
  type TrainingAvailabilityProfile,
} from './training-availability';

export type TrainingFacilityCapability = 'pool' | 'treadmill' | 'bike_trainer' | 'track';
export type TrainingLocationProfile = EquipmentProfile & {
  facilities?: TrainingFacilityCapability[];
};

export type TrainingOutingKind = 'facility_stack';

export type TrainingOutingScheduledSession = AvailabilityScheduledSession & {
  trainingOutingId?: string;
  trainingOutingKind?: TrainingOutingKind;
  scheduledLocationId?: string;
  scheduledLocationName?: string;
  transitionMinutes?: number;
};

const STACK_TRANSITION_MINUTES = 10;

export function applyTrainingOutingsToGeneratedBlock(
  generated: GeneratedWholeAthleteBlock,
  profile: TrainingAvailabilityProfile,
  locations: TrainingLocationProfile[],
  runStatus: WholeAthleteCapacityInput['runStatus'],
): GeneratedWholeAthleteBlock {
  const weeks = generated.weeks.map((week) => optimizeWeek(week, profile, locations, runStatus));
  const sessions = weeks.flatMap((week) => week.sessions) as TrainingOutingScheduledSession[];
  const events = generated.generatedEvents.map((event) => eventForScheduledSession(event, sessions));
  return { weeks, generatedEvents: events };
}

function optimizeWeek(
  week: AvailabilityScheduledWeekPlan,
  profile: TrainingAvailabilityProfile,
  locations: TrainingLocationProfile[],
  runStatus: WholeAthleteCapacityInput['runStatus'],
): AvailabilityScheduledWeekPlan {
  let sessions = week.sessions.map((session) => ({ ...session })) as TrainingOutingScheduledSession[];

  if (profile.enabled) {
    const windows = expandTrainingAvailability(profile, week.weekStartDate, week.weekEndDate) ?? [];
    const facilityLocations = locations.filter((location) => supportsPoolAndStrength(location));

    if (facilityLocations.length) {
      const location = facilityLocations[0]!;

      /*
       * First preserve/optimize swim + strength combinations that the planner
       * already placed on the same day. Then use remaining eligible strength
       * sessions as movable support work for remaining pool visits.
       *
       * This is deliberately a logistics pass, not a training-prescription
       * pass: swims stay on their prescribed dates; only safe support strength
       * may move to reduce unnecessary facility trips.
       */
      const swims = sessions
        .filter((session) =>
          session.discipline === 'swim'
          && !session.trainingOutingId
          && weekdayIndex(session.date) !== profile.restWeekday)
        .sort(compareScheduledSessions);

      for (const swimSnapshot of swims) {
        const swim = sessions.find((session) => session.id === swimSnapshot.id);
        if (!swim || swim.trainingOutingId) continue;

        const eligibleStrengths = sessions
          .filter((session) =>
            session.discipline === 'strength'
            && !session.trainingOutingId
            && weekdayIndex(session.date) !== profile.restWeekday
            && canStackSwimAndStrength(swim, session))
          .sort((left, right) =>
            strengthStackPreference(swim, left) - strengthStackPreference(swim, right)
            || compareScheduledSessions(left, right));

        for (const strength of eligibleStrengths) {
          const targetDate = swim.date;

          const placement = findStackPlacement({
            date: targetDate,
            swim,
            strength,
            allSessions: sessions,
            windows,
          });

          if (!placement) continue;

          const originalStrengthDate = strength.date;
          const outingId =
            `outing:${targetDate}:${safeId(swim.id)}:${safeId(strength.id)}`;

          const movedDay =
            originalStrengthDate === targetDate
              ? ''
              : ` Support strength moved from ${originalStrengthDate} to ${targetDate} to avoid a separate facility trip.`;

          const note =
            `Combined into one training outing at ${location.name}: swim and support strength fit inside the same availability window.${movedDay}`;

          const swimTime =
            formatAvailabilityTime(placement.swimStart) ?? 'the selected time';
          const strengthTime =
            formatAvailabilityTime(placement.strengthStart) ?? 'the selected time';

          sessions = sessions.map((session) => {
            if (session.id === swim.id) {
              return {
                ...session,
                scheduledStartAt: placement.swimStart,
                scheduledEndAt: placement.swimEnd,
                availabilityWindowId: placement.windowId,
                trainingOutingId: outingId,
                trainingOutingKind: 'facility_stack',
                scheduledLocationId: location.id,
                scheduledLocationName: location.name,
                transitionMinutes: STACK_TRANSITION_MINUTES,
                rationale: unique([
                  ...withoutOutingRationale(session.rationale),
                  `Scheduled for ${swimTime} inside your saved availability.`,
                  note,
                ]),
              };
            }

            if (session.id === strength.id) {
              return {
                ...session,
                date: targetDate,
                scheduledStartAt: placement.strengthStart,
                scheduledEndAt: placement.strengthEnd,
                availabilityWindowId: placement.windowId,
                trainingOutingId: outingId,
                trainingOutingKind: 'facility_stack',
                scheduledLocationId: location.id,
                scheduledLocationName: location.name,
                transitionMinutes: STACK_TRANSITION_MINUTES,
                rationale: unique([
                  ...withoutOutingRationale(session.rationale),
                  `Scheduled for ${strengthTime} inside your saved availability.`,
                  note,
                ]),
              };
            }

            return session;
          });

          break;
        }
      }
    }
  }

  const warnings = [...week.warnings];
  if (runStatus === 'return_to_run') {
    const exposures = sessions.filter(
      (session) =>
        session.discipline === 'run'
        && /return-to-run/i.test(session.title),
    ).length;

    if (exposures < 2) {
      warnings.push(
        `Return-to-run protocol calls for 2 separated run/walk exposures this week, but only ${exposures} fit the current safety and availability constraints. Review the week rather than treating this as the intended run frequency.`,
      );
    }
  }

  return {
    ...week,
    sessions: sessions.sort(compareScheduledSessions),
    doubleDays: rebuildDoubleDaysForSessions(week, sessions),
    warnings: unique(warnings),
  };
}

function strengthStackPreference(
  swim: TrainingOutingScheduledSession,
  strength: TrainingOutingScheduledSession,
): number {
  /*
   * Existing same-day pairings win. Otherwise prefer the nearest movable
   * support-strength session so this pass minimally perturbs the week.
   */
  if (strength.date === swim.date) return 0;

  return 100 + Math.abs(daysBetween(strength.date, swim.date));
}

function compareScheduledSessions(
  left: TrainingOutingScheduledSession,
  right: TrainingOutingScheduledSession,
): number {
  return left.date.localeCompare(right.date)
    || (left.scheduledStartAt ?? '').localeCompare(right.scheduledStartAt ?? '')
    || left.id.localeCompare(right.id);
}

function daysBetween(left: string, right: string): number {
  const leftMs = Date.parse(`${left}T12:00:00Z`);
  const rightMs = Date.parse(`${right}T12:00:00Z`);
  return Math.round((leftMs - rightMs) / 86_400_000);
}

function rebuildDoubleDaysForSessions(
  week: AvailabilityScheduledWeekPlan,
  sessions: TrainingOutingScheduledSession[],
): AvailabilityScheduledWeekPlan['doubleDays'] {
  /*
   * A cross-day strength move can create a new double day that did not exist
   * in the pre-outing plan. Preserve existing double-day metadata, but also
   * synthesize entries for new facility stacks.
   */
  const rebuilt = rebuildDoubleDays(week, sessions);
  const datesAlreadyRepresented = new Set(rebuilt.map((double) => double.date));

  for (const outing of unique(
    sessions.flatMap((session) => session.trainingOutingId ? [session.trainingOutingId] : []),
  )) {
    const members = sessions
      .filter((session) => session.trainingOutingId === outing)
      .sort(compareScheduledSessions);

    if (members.length < 2) continue;

    const date = members[0]!.date;
    if (datesAlreadyRepresented.has(date)) continue;

    /*
     * We cannot safely manufacture the full domain-specific double-day shape
     * without an existing template. If the planner had no double-day record,
     * the UI can still group the sessions through trainingOutingId.
     */
  }

  return rebuilt;
}

function findStackPlacement({
  date,
  swim,
  strength,
  allSessions,
  windows,
}: {
  date: string;
  swim: TrainingOutingScheduledSession;
  strength: TrainingOutingScheduledSession;
  allSessions: TrainingOutingScheduledSession[];
  windows: NonNullable<ReturnType<typeof expandTrainingAvailability>>;
}): { windowId: string; swimStart: string; swimEnd: string; strengthStart: string; strengthEnd: string } | null {
  const otherOccupied = allSessions
    .filter((session) => session.date === date && session.id !== swim.id && session.id !== strength.id)
    .flatMap((session) => session.scheduledStartAt && session.scheduledEndAt
      ? [{ start: Date.parse(session.scheduledStartAt), end: Date.parse(session.scheduledEndAt) }]
      : []);
  const blockMinutes = swim.durationMinutes + STACK_TRANSITION_MINUTES + strength.durationMinutes;
  const originalSwimStart = swim.scheduledStartAt ? Date.parse(swim.scheduledStartAt) : undefined;
  const originalStrengthStart =
    strength.date === date && strength.scheduledStartAt
      ? Date.parse(strength.scheduledStartAt)
      : undefined;
  const candidates: Array<{
    windowId: string;
    swimStart: string;
    swimEnd: string;
    strengthStart: string;
    strengthEnd: string;
    movementCost: number;
  }> = [];

  for (const window of windows.filter((candidate) => candidate.date === date)) {
    const windowStart = Date.parse(window.startsAt);
    const windowEnd = Date.parse(window.endsAt);
    if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) continue;
    if ((windowEnd - windowStart) / 60_000 < blockMinutes) continue;

    for (let blockStart = windowStart; blockStart + blockMinutes * 60_000 <= windowEnd; blockStart += 15 * 60_000) {
      const blockEnd = blockStart + blockMinutes * 60_000;
      if (otherOccupied.some((occupied) => blockStart < occupied.end && blockEnd > occupied.start)) continue;
      const swimStart = blockStart;
      const swimEnd = swimStart + swim.durationMinutes * 60_000;
      const strengthStart = swimEnd + STACK_TRANSITION_MINUTES * 60_000;
      const strengthEnd = strengthStart + strength.durationMinutes * 60_000;
      // Preserve the endurance session's already-selected daypart when possible;
      // support strength is deliberately cheaper to move inside a shared outing.
      const swimMovement = Number.isFinite(originalSwimStart) ? Math.abs(swimStart - originalSwimStart!) / 60_000 : 0;
      const strengthMovement = Number.isFinite(originalStrengthStart) ? Math.abs(strengthStart - originalStrengthStart!) / 60_000 : 0;
      candidates.push({
        windowId: window.id,
        swimStart: new Date(swimStart).toISOString(),
        swimEnd: new Date(swimEnd).toISOString(),
        strengthStart: new Date(strengthStart).toISOString(),
        strengthEnd: new Date(strengthEnd).toISOString(),
        movementCost: swimMovement + strengthMovement * 0.25,
      });
    }
  }

  const best = candidates.sort((left, right) => left.movementCost - right.movementCost || left.swimStart.localeCompare(right.swimStart))[0];
  if (!best) return null;
  return {
    windowId: best.windowId,
    swimStart: best.swimStart,
    swimEnd: best.swimEnd,
    strengthStart: best.strengthStart,
    strengthEnd: best.strengthEnd,
  };
}

function canStackSwimAndStrength(
  swim: TrainingOutingScheduledSession,
  strength: TrainingOutingScheduledSession,
): boolean {
  if (isHard(swim) && isHard(strength)) return false;
  if (strength.keySession) return false;
  if (strength.lowerBodyDemand === 'high') return false;
  if (strength.recoveryCost >= 4) return false;
  return true;
}

function supportsPoolAndStrength(location: TrainingLocationProfile): boolean {
  return Boolean(location.facilities?.includes('pool') && location.equipment.length > 0);
}

function eventForScheduledSession(
  event: TrainingCalendarEvent,
  sessions: TrainingOutingScheduledSession[],
): TrainingCalendarEvent {
  const session = sessions.find((candidate) => event.id.endsWith(`_${safeId(candidate.id)}`));
  if (!session?.scheduledStartAt || !session.scheduledEndAt) return event;
  const scheduledTime = formatAvailabilityTime(session.scheduledStartAt) ?? 'the selected time';
  const outingLine = session.trainingOutingId
    ? `Training outing · ${session.scheduledLocationName ?? 'shared location'} · ${scheduledTime}`
    : undefined;
  const descriptionLines = (event.description ?? '')
    .split('\n')
    .filter((line) => !line.startsWith('Scheduled for ') && !line.startsWith('Training outing · '));
  return {
    ...event,
    startAt: session.scheduledStartAt,
    endAt: session.scheduledEndAt,
    allDay: false,
    description: unique([
      ...descriptionLines,
      `Scheduled for ${scheduledTime} inside your saved availability.`,
      outingLine ?? '',
    ]).join('\n'),
  };
}

function rebuildDoubleDays(
  week: AvailabilityScheduledWeekPlan,
  sessions: TrainingOutingScheduledSession[],
): AvailabilityScheduledWeekPlan['doubleDays'] {
  return week.doubleDays.map((double) => {
    const outing = sessions.find((session) => session.date === double.date && session.trainingOutingId);
    if (!outing?.trainingOutingId) return double;
    const members = sessions
      .filter((session) => session.trainingOutingId === outing.trainingOutingId)
      .sort((left, right) => (left.scheduledStartAt ?? '').localeCompare(right.scheduledStartAt ?? ''));
    const first = members[0];
    const last = members.at(-1);
    if (!first || !last) return double;
    const start = formatAvailabilityTime(first.scheduledStartAt) ?? 'the scheduled start';
    const end = formatAvailabilityTime(last.scheduledEndAt) ?? 'the scheduled finish';
    return {
      ...double,
      sessionIds: members.map((session) => session.id),
      disciplines: members.flatMap((session) => isTrainable(session.discipline) ? [session.discipline] : []),
      rationale: `Combined training outing at ${outing.scheduledLocationName ?? 'one location'} from ${start} to ${end}. The sessions are stacked for convenience without changing the prescribed training stimulus.`,
    };
  });
}

function isHard(session: Pick<TrainingOutingScheduledSession, 'intensity' | 'recoveryCost'>): boolean {
  return session.intensity === 'hard' || session.intensity === 'max' || session.recoveryCost >= 4;
}

function isTrainable(value: string): value is 'swim' | 'bike' | 'run' | 'strength' {
  return value === 'swim' || value === 'bike' || value === 'run' || value === 'strength';
}

function withoutOutingRationale(values: string[]): string[] {
  return values.filter((line) =>
    !line.startsWith('Bundled into one visit at ')
    && !line.startsWith('Combined into one training outing at ')
    && !line.startsWith('Scheduled for ')
    && !line.startsWith('Intentional double day:')
    && !line.startsWith('Intentional double day preserved'));
}

function weekdayIndex(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 90);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
