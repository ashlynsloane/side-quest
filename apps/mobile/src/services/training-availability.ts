import type { TrainingCalendarEvent } from '@circuit/domain';
import {
  findTrainingAvailabilityPlacements,
  type TrainingAvailabilityDiscipline,
  type TrainingAvailabilityWindow,
  type TrainingDayPart,
  type TrainingTimePreference,
} from '@circuit/planner/training-availability';
import type {
  TrainableDiscipline,
  WholeAthletePlannedSession,
  WholeAthleteWeekPlan,
} from '@circuit/planner/whole-athlete-week';
import Storage from 'expo-sqlite/kv-store';

const STORAGE_KEY = 'circuit.training-availability.v1';

export interface AvailabilityClockWindow { id: string; startMinutes: number; endMinutes: number; }
export interface WeeklyAvailabilityDay { weekday: number; windows: AvailabilityClockWindow[]; }
export interface AvailabilityException { id: string; date: string; mode: 'unavailable' | 'replace' | 'block'; startMinutes?: number; endMinutes?: number; note?: string; }
export interface SportTimePreference { discipline: TrainingAvailabilityDiscipline; preferredWeekdays: number[]; preferredDayPart: TrainingDayPart; }
export interface TrainingAvailabilityProfile { version: 1; enabled: boolean; weekly: WeeklyAvailabilityDay[]; exceptions: AvailabilityException[]; preferences: SportTimePreference[]; }

export type AvailabilityScheduledSession = WholeAthletePlannedSession & {
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  availabilityWindowId?: string;
  availabilityStatus?: 'scheduled' | 'needs_time';
};
export type AvailabilityScheduledWeekPlan = Omit<WholeAthleteWeekPlan, 'sessions'> & { sessions: AvailabilityScheduledSession[]; };

export function getDefaultTrainingAvailabilityProfile(): TrainingAvailabilityProfile {
  return { version: 1, enabled: false, weekly: Array.from({ length: 7 }, (_, weekday) => ({ weekday, windows: [] })), exceptions: [], preferences: (['swim', 'bike', 'run', 'strength'] as const).map((discipline) => ({ discipline, preferredWeekdays: [], preferredDayPart: 'any' as const })) };
}
export function loadTrainingAvailabilityProfile(): TrainingAvailabilityProfile {
  const saved = Storage.getItemSync(STORAGE_KEY);
  if (!saved) return getDefaultTrainingAvailabilityProfile();
  try { return normalizeProfile(JSON.parse(saved)); } catch { return getDefaultTrainingAvailabilityProfile(); }
}
export function saveTrainingAvailabilityProfile(profile: TrainingAvailabilityProfile): void { Storage.setItemSync(STORAGE_KEY, JSON.stringify(normalizeProfile(profile))); }
export function clearTrainingAvailabilityProfile(): void { Storage.removeItemSync(STORAGE_KEY); }

export function expandTrainingAvailability(profile: TrainingAvailabilityProfile, startDate: string, endDate: string): TrainingAvailabilityWindow[] | undefined {
  if (!profile.enabled) return undefined;
  const windows: TrainingAvailabilityWindow[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    const weekday = weekdayIndex(date);
    const recurring = profile.weekly.find((item) => item.weekday === weekday)?.windows ?? [];
    const resolved = applyExceptions(recurring, profile.exceptions.filter((item) => item.date === date));
    resolved.forEach((window, index) => windows.push({ id: `availability:${date}:${window.id}:${index}`, date, startsAt: localMinuteIso(date, window.startMinutes), endsAt: localMinuteIso(date, window.endMinutes), localStartMinutes: window.startMinutes, localEndMinutes: window.endMinutes, source: profile.exceptions.some((item) => item.date === date) ? 'exception' : 'recurring' }));
  }
  return windows;
}
export function plannerTimePreferences(profile: TrainingAvailabilityProfile): TrainingTimePreference[] { return profile.preferences.map((item) => ({ discipline: item.discipline, preferredWeekdays: item.preferredWeekdays, preferredDayPart: item.preferredDayPart })); }
export function applyAvailabilityToWholeAthleteWeeks(
  weeks: WholeAthleteWeekPlan[],
  profile: TrainingAvailabilityProfile,
): AvailabilityScheduledWeekPlan[] {
  if (!profile.enabled) return weeks as AvailabilityScheduledWeekPlan[];
  const preferences = plannerTimePreferences(profile);
  return weeks.map((week) =>
    scheduleWeek(week, profile, preferences),
  );
}
export function applyAvailabilityToGeneratedEvents(events: TrainingCalendarEvent[], weeks: AvailabilityScheduledWeekPlan[]): TrainingCalendarEvent[] {
  const scheduledEndurance = weeks.flatMap((week) => week.sessions).filter((session) => session.planningCommitment === 'generated').filter((session) => session.discipline === 'swim' || session.discipline === 'bike' || session.discipline === 'run');
  const bySuffix = new Map(scheduledEndurance.map((session) => [`_${safeId(session.id)}`, session]));
  return events.flatMap((event) => {
    const match = [...bySuffix.entries()].find(([suffix]) => event.id.endsWith(suffix))?.[1];
    if (!match) return [];
    if (!match.scheduledStartAt || !match.scheduledEndAt) return [event];
    return [{ ...event, startAt: match.scheduledStartAt, endAt: match.scheduledEndAt, allDay: false, description: `${event.description ?? ''}\nScheduled inside your saved Side Quest availability.`.trim() }];
  });
}
export function formatAvailabilityTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(parsed);
}

function scheduleWeek(
  week: WholeAthleteWeekPlan,
  profile: TrainingAvailabilityProfile,
  preferences: TrainingTimePreference[],
): AvailabilityScheduledWeekPlan {
  const windows = expandTrainingAvailability(profile, week.weekStartDate, week.weekEndDate) ?? [];
  const locked = week.sessions.filter((session) => !isAvailabilityMovable(session)) as AvailabilityScheduledSession[];
  const movable = week.sessions.filter(isAvailabilityMovable).sort(schedulePriority);
  const placed: AvailabilityScheduledSession[] = [...locked];
  const unavailable: AvailabilityScheduledSession[] = [];
  for (const session of movable) {
    const preference = preferences.find((item) => item.discipline === session.discipline);
    const candidate = bestPlacement(
      session,
      placed,
      windows,
      preference,
      week.weekStartDate,
      week.weekEndDate,
      week.recoveryDayDate,
    );
    if (!candidate) {
      unavailable.push({ ...session, availabilityStatus: 'needs_time', rationale: [...withoutAvailabilityRationale(session.rationale), 'Needs a time: no saved availability window could fit this session this week.'] });
      continue;
    }
    const moved = candidate.date !== session.date;
    const timeLabel = formatAvailabilityTime(candidate.startsAt) ?? 'the selected time';
    placed.push({ ...session, date: candidate.date, scheduledStartAt: candidate.startsAt, scheduledEndAt: candidate.endsAt, availabilityWindowId: candidate.windowId, availabilityStatus: 'scheduled', rationale: [...withoutAvailabilityRationale(session.rationale), ...(moved ? [`Moved from ${friendlyDate(session.date)} to ${friendlyDate(candidate.date)} to fit your saved availability.`] : []), `Scheduled for ${timeLabel} inside your saved availability.`] });
  }
  const sessions = [...placed, ...unavailable].sort((left, right) => left.date.localeCompare(right.date) || (left.scheduledStartAt ?? '').localeCompare(right.scheduledStartAt ?? '') || left.id.localeCompare(right.id));
  const plannedMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  const generatedMinutes = sessions.filter((session) => session.planningCommitment === 'generated').reduce((sum, session) => sum + session.durationMinutes, 0);
  const disciplineSummary = week.disciplineSummary.map((summary) => { const matching = sessions.filter((session) => session.discipline === summary.discipline); return { ...summary, sessions: matching.length, minutes: matching.reduce((sum, session) => sum + session.durationMinutes, 0) }; });
  const availabilityWarnings = unavailable.map((session) => `${session.title} still needs a time because no saved availability window could fit it.`);
  return { ...week, sessions, plannedMinutes, generatedMinutes, disciplineSummary, doubleDays: rebuildDoubleDays(sessions.filter((session) => session.availabilityStatus !== 'needs_time')), warnings: [...new Set([...week.warnings, ...availabilityWarnings])] };
}

function bestPlacement(
  session: WholeAthletePlannedSession,
  placed: AvailabilityScheduledSession[],
  windows: TrainingAvailabilityWindow[],
  preference: TrainingTimePreference | undefined,
  weekStart: string,
  weekEnd: string,
  recoveryDayDate?: string,
): { date: string; startsAt: string; endsAt: string; windowId: string; score: number } | null {
  const candidates: Array<{ date: string; startsAt: string; endsAt: string; windowId: string; score: number }> = [];

  for (let date = weekStart; date <= weekEnd; date = addDays(date, 1)) {
    // Availability may move generated work, but it may not override the
    // recovery day already resolved by the whole-athlete planner.
    if (date === recoveryDayDate) continue;
    const sameDay = placed.filter((item) => item.date === date && isTrainable(item.discipline));
    if (sameDay.length >= 2) continue;
    if (sameDay.some((item) => item.discipline === session.discipline)) continue;
    if (sameDay.length && !compatibleDouble(session, sameDay[0]!)) continue;
    if (isHard(session) && placed.some((item) => isHard(item) && Math.abs(dayDifference(item.date, date)) <= 1)) continue;
    if (session.discipline === 'run' && /return-to-run/i.test(session.title) && placed.some((item) => item.discipline === 'run' && Math.abs(dayDifference(item.date, date)) < 2)) continue;
    const occupied = sameDay.flatMap((item) => item.scheduledStartAt && item.scheduledEndAt ? [{ startsAt: item.scheduledStartAt, endsAt: item.scheduledEndAt }] : []);
    const placements = findTrainingAvailabilityPlacements({ date, durationMinutes: session.durationMinutes, discipline: session.discipline as TrainingAvailabilityDiscipline, windows, occupied, preference, minimumGapMinutes: sameDay.length ? 180 : 0 });
    for (const placement of placements) {
      let score = placement.preferenceScore;
      if (date === session.date) score += 36;
      if (session.keySession && date === session.date) score += 12;
      if ((session.discipline === 'bike' || session.discipline === 'run') && /long/i.test(session.title) && weekdayIndex(date) >= 5) score += 18;
      if (sameDay.length) score += doubleDayGapScore(placement.startsAt, placement.endsAt, sameDay[0]!);
      candidates.push({ date, startsAt: placement.startsAt, endsAt: placement.endsAt, windowId: placement.windowId, score });
    }
  }
  // Availability schedules WHEN the planned session happens first.
  // It only changes the planned WEEKDAY when that weekday has no feasible
  // availability window at all.
  //
  // This preserves the whole-athlete planner's weekly rhythm while still
  // allowing true availability constraints to override it when necessary.
  const originalDayCandidates = candidates.filter(
    (candidate) => candidate.date === session.date,
  );
  const eligibleCandidates = originalDayCandidates.length
    ? originalDayCandidates
    : candidates;

  return eligibleCandidates.sort(
    (left, right) =>
      right.score - left.score
      || left.startsAt.localeCompare(right.startsAt),
  )[0] ?? null;
}
function compatibleDouble(candidate: WholeAthletePlannedSession, existing: AvailabilityScheduledSession): boolean {
  if (!isTrainable(existing.discipline) || candidate.discipline === existing.discipline) return false;
  if (isHard(candidate) && isHard(existing)) return false;
  const pair = new Set([candidate.discipline, existing.discipline]);
  if (pair.has('swim')) return true;
  if (pair.has('bike') && pair.has('run')) return !isHard(candidate) && !isHard(existing) && candidate.recoveryCost <= 3 && existing.recoveryCost <= 3;
  if (pair.has('strength') && (pair.has('bike') || pair.has('run'))) { const strength = candidate.discipline === 'strength' ? candidate : existing; const endurance = candidate.discipline === 'strength' ? existing : candidate; return strength.intensity === 'easy' && !isHard(endurance) && endurance.lowerBodyDemand !== 'high'; }
  return false;
}
function doubleDayGapScore(startsAt: string, endsAt: string, existing: AvailabilityScheduledSession): number {
  if (!existing.scheduledStartAt || !existing.scheduledEndAt) return -6;
  const leftStart = Date.parse(startsAt), leftEnd = Date.parse(endsAt), rightStart = Date.parse(existing.scheduledStartAt), rightEnd = Date.parse(existing.scheduledEndAt);
  const gapMinutes = leftStart >= rightEnd ? (leftStart - rightEnd) / 60_000 : rightStart >= leftEnd ? (rightStart - leftEnd) / 60_000 : 0;
  if (gapMinutes >= 360) return 18; if (gapMinutes >= 240) return 10; if (gapMinutes >= 180) return 3; return -20;
}
function rebuildDoubleDays(sessions: AvailabilityScheduledSession[]): WholeAthleteWeekPlan['doubleDays'] {
  const byDate = new Map<string, AvailabilityScheduledSession[]>();
  for (const session of sessions.filter((item) => isTrainable(item.discipline))) { const group = byDate.get(session.date) ?? []; group.push(session); byDate.set(session.date, group); }
  return [...byDate.entries()].filter(([, items]) => items.length >= 2).map(([date, items]) => {
    const ordered = [...items].sort((left, right) => (left.scheduledStartAt ?? '').localeCompare(right.scheduledStartAt ?? ''));
    const first = ordered[0]!, second = ordered[1]!;
    const firstTime = formatAvailabilityTime(first.scheduledStartAt), secondTime = formatAvailabilityTime(second.scheduledStartAt);
    return { date, sessionIds: ordered.map((item) => item.id), disciplines: ordered.map((item) => item.discipline).filter(isTrainable), rationale: firstTime && secondTime ? `Intentional double day: ${friendlyDiscipline(first.discipline)} at ${firstTime}, then ${friendlyDiscipline(second.discipline)} at ${secondTime}. The separation preserves recovery between sessions.` : 'Intentional double day preserved because the pairing is compatible with the weekly plan.', athleteSpecified: ordered.every((item) => item.planningCommitment !== 'generated') };
  });
}
function applyExceptions(recurring: AvailabilityClockWindow[], exceptions: AvailabilityException[]): AvailabilityClockWindow[] {
  let windows = recurring.map((item) => ({ ...item }));
  for (const exception of exceptions) {
    if (exception.mode === 'unavailable') { windows = []; continue; }
    const start = validMinute(exception.startMinutes), end = validMinute(exception.endMinutes);
    if (start === undefined || end === undefined || end <= start) continue;
    if (exception.mode === 'replace') { windows = [{ id: exception.id, startMinutes: start, endMinutes: end }]; continue; }
    windows = windows.flatMap((window) => subtractWindow(window, start, end));
  }
  return normalizeWindows(windows);
}
function subtractWindow(window: AvailabilityClockWindow, blockStart: number, blockEnd: number): AvailabilityClockWindow[] {
  if (blockEnd <= window.startMinutes || blockStart >= window.endMinutes) return [window];
  const values: AvailabilityClockWindow[] = [];
  if (blockStart > window.startMinutes) values.push({ ...window, id: `${window.id}:before`, endMinutes: Math.min(blockStart, window.endMinutes) });
  if (blockEnd < window.endMinutes) values.push({ ...window, id: `${window.id}:after`, startMinutes: Math.max(blockEnd, window.startMinutes) });
  return values.filter((item) => item.endMinutes > item.startMinutes);
}
function normalizeProfile(value: unknown): TrainingAvailabilityProfile {
  const fallback = getDefaultTrainingAvailabilityProfile(); if (!value || typeof value !== 'object') return fallback; const candidate = value as Partial<TrainingAvailabilityProfile>;
  const weekly = Array.from({ length: 7 }, (_, weekday) => { const found = Array.isArray(candidate.weekly) ? candidate.weekly.find((item) => item?.weekday === weekday) : undefined; return { weekday, windows: normalizeWindows(found?.windows ?? []) }; });
  const exceptions = Array.isArray(candidate.exceptions) ? candidate.exceptions.filter(isException).map((item) => ({ ...item, note: typeof item.note === 'string' ? item.note.slice(0, 120) : undefined })) : [];
  const preferences = (['swim', 'bike', 'run', 'strength'] as const).map((discipline) => { const found = Array.isArray(candidate.preferences) ? candidate.preferences.find((item) => item?.discipline === discipline) : undefined; return { discipline, preferredWeekdays: Array.isArray(found?.preferredWeekdays) ? [...new Set(found!.preferredWeekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))] : [], preferredDayPart: isDayPart(found?.preferredDayPart) ? found!.preferredDayPart : 'any' as const }; });
  return { version: 1, enabled: Boolean(candidate.enabled), weekly, exceptions, preferences };
}
function normalizeWindows(values: AvailabilityClockWindow[]): AvailabilityClockWindow[] { return values.filter((item) => typeof item?.id === 'string').map((item) => ({ id: item.id, startMinutes: Math.round(item.startMinutes), endMinutes: Math.round(item.endMinutes) })).filter((item) => item.startMinutes >= 0 && item.endMinutes <= 24 * 60 && item.endMinutes > item.startMinutes).sort((left, right) => left.startMinutes - right.startMinutes); }
function isException(value: unknown): value is AvailabilityException { if (!value || typeof value !== 'object') return false; const item = value as AvailabilityException; return typeof item.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && (item.mode === 'unavailable' || item.mode === 'replace' || item.mode === 'block'); }
function isDayPart(value: unknown): value is TrainingDayPart { return value === 'morning' || value === 'midday' || value === 'evening' || value === 'any'; }
function validMinute(value: number | undefined): number | undefined { return value !== undefined && Number.isFinite(value) && value >= 0 && value <= 24 * 60 ? Math.round(value) : undefined; }
function localMinuteIso(date: string, minutes: number): string { const [year, month, day] = date.split('-').map(Number); return new Date(year!, month! - 1, day!, 0, minutes, 0, 0).toISOString(); }
function weekdayIndex(date: string): number { const day = new Date(`${date}T12:00:00Z`).getUTCDay(); return (day + 6) % 7; }
function addDays(date: string, days: number): string { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function dayDifference(left: string, right: string): number { return Math.round((Date.parse(`${right}T12:00:00Z`) - Date.parse(`${left}T12:00:00Z`)) / 86_400_000); }
function schedulePriority(left: WholeAthletePlannedSession, right: WholeAthletePlannedSession): number { const rank = (session: WholeAthletePlannedSession) => { if (session.discipline === 'run' && /return-to-run/i.test(session.title)) return 0; if (session.keySession || isHard(session)) return 1; if (/long/i.test(session.title)) return 2; if (session.discipline === 'strength') return 3; return 4; }; return rank(left) - rank(right) || left.date.localeCompare(right.date) || left.id.localeCompare(right.id); }
function isAvailabilityMovable(session: WholeAthletePlannedSession): boolean { return session.planningCommitment === 'generated' || (session.discipline === 'strength' && session.source === 'side_quest'); }
function isHard(session: Pick<WholeAthletePlannedSession, 'intensity' | 'recoveryCost'>): boolean { return session.intensity === 'hard' || session.intensity === 'max' || session.recoveryCost >= 4; }
function isTrainable(value: string): value is TrainableDiscipline { return value === 'swim' || value === 'bike' || value === 'run' || value === 'strength'; }
function friendlyDiscipline(value: string): string { if (value === 'bike') return 'Bike'; if (value === 'run') return 'Run'; if (value === 'swim') return 'Swim'; return 'Strength'; }
function friendlyDate(date: string): string { return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(`${date}T12:00:00`)); }
function withoutAvailabilityRationale(values: string[]): string[] { return values.filter((line) => !line.startsWith('Moved from ') && !line.startsWith('Scheduled for ') && !line.startsWith('Needs a time:')); }
function safeId(value: string): string { return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 90); }
