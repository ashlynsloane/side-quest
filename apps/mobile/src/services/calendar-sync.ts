import type {
  EnduranceDiscipline,
  EnduranceSchedule,
  TrainingCalendarEvent,
  TrainingCalendarSource,
  Weekday,
} from '@circuit/domain';
import { zonedWallTimeToUtc } from '@circuit/planner';

import {
  getTrainingCalendarEventsForSource,
  getTrainingCalendarSource,
  listTrainingCalendarSources,
  replaceTrainingCalendarEvents,
  saveTrainingCalendarSource,
} from './database';
import { rebuildPlannedCompletedMatches } from './endurance';

const DEFAULT_REFRESH_INTERVAL_MINUTES = 60;
const inFlight = new Map<string, Promise<CalendarSyncResult>>();

export interface CalendarSyncResult {
  source: TrainingCalendarSource;
  events: TrainingCalendarEvent[];
  notModified: boolean;
}

export async function syncIcsCalendar({
  url,
  name = 'Training calendar',
  sourceId,
  force = false,
}: {
  url: string;
  name?: string;
  sourceId?: string;
  force?: boolean;
}): Promise<CalendarSyncResult> {
  const normalized = normalizeCalendarUrl(url);
  const id = sourceId ?? `calendar_${hashString(normalized).toString(16)}`;
  const existing = await getTrainingCalendarSource(id);
  const pending = inFlight.get(id);
  if (pending) return pending;
  const operation = runCalendarSync({ id, normalized, originalUrl: url, name, existing, force });
  inFlight.set(id, operation);
  try { return await operation; } finally { inFlight.delete(id); }
}

async function runCalendarSync({
  id,
  normalized,
  originalUrl,
  name,
  existing,
  force,
}: {
  id: string;
  normalized: string;
  originalUrl: string;
  name: string;
  existing: TrainingCalendarSource | null;
  force: boolean;
}): Promise<CalendarSyncResult> {
  const attemptedAt = new Date().toISOString();
  const base: TrainingCalendarSource = {
    id,
    name,
    sourceType: /trainingpeaks/i.test(originalUrl) ? 'trainingpeaks_ics' : 'ics',
    url: originalUrl,
    active: existing?.active ?? true,
    autoRefresh: existing?.autoRefresh ?? true,
    refreshIntervalMinutes: existing?.refreshIntervalMinutes ?? DEFAULT_REFRESH_INTERVAL_MINUTES,
    syncStatus: 'syncing',
    lastAttemptedAt: attemptedAt,
    lastSuccessfulAt: existing?.lastSuccessfulAt ?? existing?.lastSyncedAt,
    lastSyncedAt: existing?.lastSyncedAt,
    lastError: undefined,
    consecutiveFailures: existing?.consecutiveFailures ?? 0,
    etag: existing?.etag,
    lastModified: existing?.lastModified,
    lastEventCount: existing?.lastEventCount,
    createdAt: existing?.createdAt ?? attemptedAt,
    updatedAt: attemptedAt,
  };
  await saveTrainingCalendarSource(base);
  try {
    const headers: Record<string, string> = { Accept: 'text/calendar,text/plain,*/*' };
    if (!force && existing?.etag) headers['If-None-Match'] = existing.etag;
    if (!force && existing?.lastModified) headers['If-Modified-Since'] = existing.lastModified;
    const response = await fetch(normalized, { headers });
    if (response.status === 304) {
      const events = await getTrainingCalendarEventsForSource(id);
      const source: TrainingCalendarSource = {
        ...base,
        syncStatus: 'not_modified',
        lastSuccessfulAt: attemptedAt,
        lastSyncedAt: attemptedAt,
        lastEventCount: events.length,
        consecutiveFailures: 0,
        updatedAt: attemptedAt,
      };
      await saveTrainingCalendarSource(source);
      return { source, events, notModified: true };
    }
    if (!response.ok) throw new Error(`Calendar sync failed with status ${response.status}.`);
    const text = await response.text();
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('The URL did not return an iCalendar feed.');
    const events = parseIcsEvents(text, id);
    await replaceTrainingCalendarEvents(id, events);
    await rebuildPlannedCompletedMatches();
    const source: TrainingCalendarSource = {
      ...base,
      syncStatus: 'success',
      lastSuccessfulAt: attemptedAt,
      lastSyncedAt: attemptedAt,
      lastError: undefined,
      consecutiveFailures: 0,
      etag: response.headers.get('etag') ?? existing?.etag,
      lastModified: response.headers.get('last-modified') ?? existing?.lastModified,
      lastEventCount: events.length,
      updatedAt: attemptedAt,
    };
    await saveTrainingCalendarSource(source);
    return { source, events, notModified: false };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Calendar sync failed.';
    const failed: TrainingCalendarSource = {
      ...base,
      syncStatus: 'error',
      lastError: message,
      consecutiveFailures: (existing?.consecutiveFailures ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    await saveTrainingCalendarSource(failed);
    throw new CalendarSyncError(message, failed);
  }
}

export async function autoRefreshTrainingCalendars({
  force = false,
  now = new Date(),
}: { force?: boolean; now?: Date } = {}): Promise<CalendarSyncResult[]> {
  const sources = (await listTrainingCalendarSources())
    .filter((source) => source.active && source.autoRefresh !== false && source.url)
    .filter((source) => force || shouldRefreshCalendarSource(source, now));
  const results: CalendarSyncResult[] = [];
  for (const source of sources) {
    try {
      results.push(await syncIcsCalendar({
        url: source.url!, name: source.name, sourceId: source.id, force,
      }));
    } catch {
      // Each source persists its own error state. One failure must not block another source.
    }
  }
  return results;
}

export function shouldRefreshCalendarSource(source: TrainingCalendarSource, now = new Date()): boolean {
  if (!source.active || source.autoRefresh === false || !source.url) return false;
  if (source.syncStatus === 'syncing' && source.lastAttemptedAt) {
    const stillLive = now.getTime() - new Date(source.lastAttemptedAt).getTime() < 10 * 60_000;
    if (stillLive) return false;
  }
  const anchor = source.lastAttemptedAt ?? source.lastSuccessfulAt ?? source.lastSyncedAt;
  if (!anchor) return true;
  const interval = Math.max(15, source.refreshIntervalMinutes ?? DEFAULT_REFRESH_INTERVAL_MINUTES);
  const backoff = Math.min(12 * 60, interval * Math.max(1, 2 ** Math.min(4, source.consecutiveFailures ?? 0)));
  return now.getTime() - new Date(anchor).getTime() >= backoff * 60_000;
}

export class CalendarSyncError extends Error {
  readonly source: TrainingCalendarSource;
  constructor(message: string, source: TrainingCalendarSource) {
    super(message);
    this.name = 'CalendarSyncError';
    this.source = source;
  }
}

export function parseIcsEvents(text: string, sourceId: string): TrainingCalendarEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  return blocks.flatMap((block, index) => {
    const fields = parseFields(block);
    const startRaw = fields.DTSTART;
    if (!startRaw) return [];
    const start = parseIcsDate(startRaw.value, startRaw.params);
    if (!start) return [];
    const endRaw = fields.DTEND;
    const end = endRaw ? parseIcsDate(endRaw.value, endRaw.params) : null;
    const title = decodeIcsText(fields.SUMMARY?.value ?? 'Training event');
    const uid = decodeIcsText(fields.UID?.value ?? `${sourceId}-${index}-${start.iso}`);
    return [{
      id: `calendar_event_${hashString(`${sourceId}-${uid}-${start.iso}`).toString(16)}`,
      sourceId,
      title,
      startAt: start.iso,
      endAt: end?.iso,
      allDay: start.allDay,
      discipline: inferDiscipline(title, fields.DESCRIPTION?.value),
      description: fields.DESCRIPTION ? decodeIcsText(fields.DESCRIPTION.value) : undefined,
      location: fields.LOCATION ? decodeIcsText(fields.LOCATION.value) : undefined,
      externalUid: uid,
      timeZone: start.timeZone,
    } satisfies TrainingCalendarEvent];
  }).sort((left, right) => left.startAt.localeCompare(right.startAt));
}

export function suggestEnduranceSchedule(
  events: TrainingCalendarEvent[],
  referenceDate = new Date(),
): EnduranceSchedule {
  const start = startOfWeek(referenceDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const withinWeek = events.filter((event) => {
    const value = new Date(event.startAt);
    return value >= start && value < end;
  });
  return {
    keySwim: chooseKeyDay(withinWeek, 'swim'),
    keyBike: chooseKeyDay(withinWeek, 'bike'),
    keyRun: chooseKeyDay(withinWeek, 'run'),
  };
}

function chooseKeyDay(events: TrainingCalendarEvent[], discipline: EnduranceDiscipline): Weekday | null {
  const candidates = events.filter((event) => event.discipline === discipline);
  if (candidates.length === 0) return null;
  candidates.sort((left, right) => eventPriority(right) - eventPriority(left));
  return weekdayFromDate(new Date(candidates[0].startAt));
}

function eventPriority(event: TrainingCalendarEvent): number {
  const text = `${event.title} ${event.description ?? ''}`.toLowerCase();
  let score = 1;
  if (/long|race|brick|threshold|tempo|interval|vo2|key|quality/.test(text)) score += 5;
  if (/easy|recovery|technique|drill/.test(text)) score -= 2;
  if (event.endAt) score += Math.max(0, (new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 3_600_000);
  return score;
}

function inferDiscipline(title: string, description?: string): TrainingCalendarEvent['discipline'] {
  const text = `${title} ${description ?? ''}`.toLowerCase();
  if (/strength|weights|gym|resistance/.test(text)) return 'strength';
  if (/rest|off day|recovery day/.test(text)) return 'rest';
  if (/swim|pool|open water/.test(text)) return 'swim';
  if (/bike|ride|cycling|trainer|zwift/.test(text)) return 'bike';
  if (/run|jog|trail|track|treadmill/.test(text)) return 'run';
  return 'other';
}

function parseFields(block: string) {
  const result: Record<string, { value: string; params: string }> = {};
  for (const line of block.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const left = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const [name, ...params] = left.split(';');
    result[name.toUpperCase()] = { value, params: params.join(';') };
  }
  return result;
}

function parseIcsDate(value: string, params: string): { iso: string; allDay: boolean; timeZone?: string } | null {
  if (/VALUE=DATE/i.test(params) || /^\d{8}$/.test(value)) {
    const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!match) return null;
    return { iso: `${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`, allDay: true };
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return null;
  if (match[7] === 'Z') {
    return { iso: `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`, allDay: false };
  }
  const zoneMatch = params.match(/(?:^|;)TZID=(?:"([^"]+)"|([^;]+))/i);
  const timeZone = (zoneMatch?.[1] ?? zoneMatch?.[2])?.trim();
  if (timeZone) {
    try {
      return {
        iso: zonedWallTimeToUtc({
          year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
          hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6]),
        }, timeZone),
        allDay: false,
        timeZone,
      };
    } catch {
      // Preserve the event instead of discarding the full calendar when a vendor emits an unknown TZID.
    }
  }
  const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return { iso: parsed.toISOString(), allDay: false, timeZone };
}

function normalizeCalendarUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Enter a calendar URL first.');
  if (trimmed.startsWith('webcal://')) return `https://${trimmed.slice('webcal://'.length)}`;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  throw new Error('Calendar URL must begin with webcal://, http://, or https://.');
}

function decodeIcsText(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + offset);
  return result;
}

function weekdayFromDate(date: Date): Weekday {
  const values: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return values[date.getDay()] ?? 'monday';
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
